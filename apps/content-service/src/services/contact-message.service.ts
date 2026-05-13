import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RpcException } from '@nestjs/microservices';
import { CynaLoggerService } from '@cyna-api/common';
import { ContactMessage } from '../entities';
import { CreateContactMessageDto, ContactMessageQueryDto, UpdateContactMessageDto } from '../dto';

@Injectable()
export class ContactMessageService {
  constructor(
    @InjectRepository(ContactMessage)
    private readonly contactMessageRepository: Repository<ContactMessage>,
    private readonly logger: CynaLoggerService,
  ) {}

  async create(dto: CreateContactMessageDto): Promise<ContactMessage> {
    const message = this.contactMessageRepository.create({
      name: dto.name,
      email: dto.email,
      subject: dto.subject,
      message: dto.message,
    });

    await this.contactMessageRepository.save(message);
    this.logger.log(`Contact message created: ${message.id}`);

    return message;
  }

  async findAll(
    query: ContactMessageQueryDto,
  ): Promise<{ data: ContactMessage[]; meta: { total: number; page: number; limit: number } }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const skip = (page - 1) * limit;

    const queryBuilder = this.contactMessageRepository
      .createQueryBuilder('contact_message')
      .orderBy('contact_message.created_at', 'DESC');

    if (query.isRead !== undefined) {
      queryBuilder.andWhere('contact_message.is_read = :isRead', {
        isRead: query.isRead,
      });
    }

    if (query.isProcessed !== undefined) {
      queryBuilder.andWhere('contact_message.is_processed = :isProcessed', {
        isProcessed: query.isProcessed,
      });
    }

    const [data, total] = await queryBuilder.skip(skip).take(limit).getManyAndCount();

    return {
      data,
      meta: { total, page, limit },
    };
  }

  async update(id: string, dto: UpdateContactMessageDto): Promise<ContactMessage> {
    const message = await this.contactMessageRepository.findOne({ where: { id } });

    if (!message) {
      this.logger.warn(`Contact message not found: ${id}`);
      throw new RpcException({
        statusCode: 404,
        message: 'errors.content.contactMessageNotFound',
        code: 'CONTACT_MESSAGE_NOT_FOUND',
      });
    }

    Object.assign(message, dto);
    await this.contactMessageRepository.save(message);

    this.logger.log(`Contact message updated: ${id}`);

    return message;
  }

  async delete(id: string): Promise<void> {
    const message = await this.contactMessageRepository.findOne({ where: { id } });

    if (!message) {
      this.logger.warn(`Contact message not found: ${id}`);
      throw new RpcException({
        statusCode: 404,
        message: 'errors.content.contactMessageNotFound',
        code: 'CONTACT_MESSAGE_NOT_FOUND',
      });
    }

    await this.contactMessageRepository.remove(message);
    this.logger.log(`Contact message deleted: ${id}`);
  }
}
