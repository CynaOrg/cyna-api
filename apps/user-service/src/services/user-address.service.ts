// apps/user-service/src/services/user-address.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { RpcException } from '@nestjs/microservices';
import { CynaLoggerService } from '@cyna-api/common';
import { UserAddress } from '../entities/user-address.entity';
import { CreateUserAddressDto, UpdateUserAddressDto } from '../dto';

const MAX_ADDRESSES_PER_USER = 10;

@Injectable()
export class UserAddressService {
  constructor(
    @InjectRepository(UserAddress)
    private readonly repo: Repository<UserAddress>,
    private readonly dataSource: DataSource,
    private readonly logger: CynaLoggerService,
  ) {}

  list(userId: string): Promise<UserAddress[]> {
    return this.repo.find({
      where: { userId },
      order: {
        isDefaultBilling: 'DESC',
        isDefaultShipping: 'DESC',
        createdAt: 'DESC',
      },
    });
  }

  async create(userId: string, dto: CreateUserAddressDto): Promise<UserAddress> {
    return this.dataSource.transaction(async (manager) => {
      const count = await manager.count(UserAddress, { where: { userId } });
      if (count >= MAX_ADDRESSES_PER_USER) {
        throw new RpcException({
          statusCode: 400,
          message: `Address limit reached (${MAX_ADDRESSES_PER_USER}).`,
          code: 'ADDRESS_LIMIT_REACHED',
        });
      }

      if (dto.isDefaultShipping) {
        await manager.update(
          UserAddress,
          { userId, isDefaultShipping: true },
          { isDefaultShipping: false },
        );
      }
      if (dto.isDefaultBilling) {
        await manager.update(
          UserAddress,
          { userId, isDefaultBilling: true },
          { isDefaultBilling: false },
        );
      }

      const entity = manager.create(UserAddress, { ...dto, userId });
      const saved = await manager.save(UserAddress, entity);
      this.logger.log(`Address created: ${saved.id} for user ${userId}`, 'UserAddressService');
      return saved;
    });
  }

  async update(userId: string, id: string, dto: UpdateUserAddressDto): Promise<UserAddress> {
    return this.dataSource.transaction(async (manager) => {
      const existing = await manager.findOne(UserAddress, { where: { id, userId } });
      if (!existing) {
        throw new RpcException({
          statusCode: 404,
          message: 'Address not found',
          code: 'ADDRESS_NOT_FOUND',
        });
      }

      if (dto.isDefaultShipping === true && existing.isDefaultShipping === false) {
        await manager.update(
          UserAddress,
          { userId, isDefaultShipping: true },
          { isDefaultShipping: false },
        );
      }
      if (dto.isDefaultBilling === true && existing.isDefaultBilling === false) {
        await manager.update(
          UserAddress,
          { userId, isDefaultBilling: true },
          { isDefaultBilling: false },
        );
      }

      if (dto.label !== undefined) existing.label = dto.label;
      if (dto.recipientName !== undefined) existing.recipientName = dto.recipientName;
      if (dto.street !== undefined) existing.street = dto.street;
      if (dto.streetLine2 !== undefined) existing.streetLine2 = dto.streetLine2;
      if (dto.city !== undefined) existing.city = dto.city;
      if (dto.postalCode !== undefined) existing.postalCode = dto.postalCode;
      if (dto.state !== undefined) existing.state = dto.state;
      if (dto.country !== undefined) existing.country = dto.country;
      if (dto.phone !== undefined) existing.phone = dto.phone;
      if (dto.isDefaultShipping !== undefined) existing.isDefaultShipping = dto.isDefaultShipping;
      if (dto.isDefaultBilling !== undefined) existing.isDefaultBilling = dto.isDefaultBilling;

      const saved = await manager.save(UserAddress, existing);
      this.logger.log(`Address updated: ${id} for user ${userId}`, 'UserAddressService');
      return saved;
    });
  }

  async delete(userId: string, id: string): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const existing = await manager.findOne(UserAddress, { where: { id, userId } });
      if (!existing) {
        throw new RpcException({
          statusCode: 404,
          message: 'Address not found',
          code: 'ADDRESS_NOT_FOUND',
        });
      }
      await manager.delete(UserAddress, { id, userId });
      this.logger.log(`Address deleted: ${id} for user ${userId}`, 'UserAddressService');
    });
  }
}
