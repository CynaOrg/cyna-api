import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RpcException } from '@nestjs/microservices';
import { CynaLoggerService } from '@cyna-api/common';
import { User } from '../entities/user.entity';
import { AdminUpdateStatusDto } from '../dto/admin-update-status.dto';

export interface AdminListQuery {
  page?: number;
  limit?: number;
  search?: string;
  isActive?: boolean;
  isVerified?: boolean;
}

export interface AdminListResult {
  items: Array<Omit<User, 'passwordHash'>>;
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class UserAdminService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly logger: CynaLoggerService,
  ) {}

  async adminList(query: AdminListQuery): Promise<AdminListResult> {
    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 20, 100);
    const offset = (page - 1) * limit;

    const qb = this.userRepository
      .createQueryBuilder('user')
      .orderBy('user.createdAt', 'DESC')
      .skip(offset)
      .take(limit);

    if (query.search) {
      qb.andWhere(
        '(user.email ILIKE :s OR user.firstName ILIKE :s OR user.lastName ILIKE :s OR user.companyName ILIKE :s)',
        { s: `%${query.search}%` },
      );
    }
    if (query.isActive !== undefined) {
      qb.andWhere('user.isActive = :isActive', { isActive: query.isActive });
    }
    if (query.isVerified !== undefined) {
      qb.andWhere('user.isVerified = :isVerified', { isVerified: query.isVerified });
    }

    const [items, total] = await qb.getManyAndCount();
    return { items: items.map(this.stripPasswordHash), total, page, limit };
  }

  async adminGet(userId: string): Promise<Omit<User, 'passwordHash'>> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new RpcException({
        statusCode: 404,
        message: 'User not found',
        code: 'USER_NOT_FOUND',
      });
    }
    return this.stripPasswordHash(user);
  }

  async adminUpdateStatus(
    userId: string,
    dto: AdminUpdateStatusDto,
  ): Promise<Omit<User, 'passwordHash'>> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new RpcException({
        statusCode: 404,
        message: 'User not found',
        code: 'USER_NOT_FOUND',
      });
    }
    user.isActive = dto.isActive;
    const saved = await this.userRepository.save(user);
    this.logger.log(
      `Admin ${dto.isActive ? 'activated' : 'deactivated'} user: ${saved.email}`,
      'UserAdminService',
    );
    return this.stripPasswordHash(saved);
  }

  private stripPasswordHash(user: User): Omit<User, 'passwordHash'> {
    const { passwordHash: _passwordHash, ...rest } = user;
    return rest;
  }
}
