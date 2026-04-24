// apps/user-service/src/services/user-address.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { RpcException } from '@nestjs/microservices';
import { UserAddress } from '../entities/user-address.entity';
import { UserAddressService } from './user-address.service';
import { CreateUserAddressDto } from '../dto';

describe('UserAddressService', () => {
  let service: UserAddressService;
  let repo: jest.Mocked<Repository<UserAddress>>;
  let dataSource: jest.Mocked<DataSource>;

  const mockTxManager = {
    update: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
    findOne: jest.fn(),
    count: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserAddressService,
        {
          provide: getRepositoryToken(UserAddress),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
            count: jest.fn(),
          },
        },
        {
          provide: DataSource,
          useValue: {
            transaction: jest.fn((cb: any) => cb({ ...mockTxManager })),
          },
        },
      ],
    }).compile();

    service = module.get(UserAddressService);
    repo = module.get(getRepositoryToken(UserAddress));
    dataSource = module.get(DataSource);
  });

  describe('list', () => {
    it('returns addresses ordered by defaults then createdAt desc', async () => {
      const rows = [{ id: 'a1' }, { id: 'a2' }] as UserAddress[];
      repo.find.mockResolvedValue(rows);
      const result = await service.list('u1');
      expect(repo.find).toHaveBeenCalledWith({
        where: { userId: 'u1' },
        order: {
          isDefaultBilling: 'DESC',
          isDefaultShipping: 'DESC',
          createdAt: 'DESC',
        },
      });
      expect(result).toBe(rows);
    });
  });

  describe('create', () => {
    const dto = {
      label: 'Home',
      recipientName: 'Alice',
      street: '1 rue',
      city: 'Paris',
      postalCode: '75000',
      country: 'FR',
    } as CreateUserAddressDto;

    it('creates an address when the user has room', async () => {
      mockTxManager.count.mockResolvedValue(3);
      mockTxManager.create.mockReturnValue({ ...dto, userId: 'u1' } as UserAddress);
      mockTxManager.save.mockResolvedValue({ id: 'new', ...dto, userId: 'u1' } as UserAddress);

      const result = await service.create('u1', dto);

      expect(mockTxManager.count).toHaveBeenCalledWith(UserAddress, { where: { userId: 'u1' } });
      expect(mockTxManager.save).toHaveBeenCalled();
      expect(result.id).toBe('new');
    });

    it('throws RpcException 400 when the cap (10) is reached', async () => {
      mockTxManager.count.mockResolvedValue(10);
      await expect(service.create('u1', dto)).rejects.toThrow(RpcException);
    });

    it('clears previous default_shipping before saving when flag is true', async () => {
      mockTxManager.count.mockResolvedValue(1);
      mockTxManager.create.mockReturnValue({ ...dto, isDefaultShipping: true } as UserAddress);
      mockTxManager.save.mockResolvedValue({ id: 'new' } as UserAddress);

      await service.create('u1', { ...dto, isDefaultShipping: true });

      expect(mockTxManager.update).toHaveBeenCalledWith(
        UserAddress,
        { userId: 'u1', isDefaultShipping: true },
        { isDefaultShipping: false },
      );
    });

    it('clears previous default_billing before saving when flag is true', async () => {
      mockTxManager.count.mockResolvedValue(1);
      mockTxManager.create.mockReturnValue({ ...dto, isDefaultBilling: true } as UserAddress);
      mockTxManager.save.mockResolvedValue({ id: 'new' } as UserAddress);

      await service.create('u1', { ...dto, isDefaultBilling: true });

      expect(mockTxManager.update).toHaveBeenCalledWith(
        UserAddress,
        { userId: 'u1', isDefaultBilling: true },
        { isDefaultBilling: false },
      );
    });
  });

  describe('update', () => {
    it('throws NotFound (RpcException 404) if the address does not belong to the user', async () => {
      mockTxManager.findOne.mockResolvedValue(null);
      await expect(service.update('u1', 'addr', { label: 'X' })).rejects.toThrow(RpcException);
      expect(mockTxManager.findOne).toHaveBeenCalledWith(UserAddress, {
        where: { id: 'addr', userId: 'u1' },
      });
    });

    it('clears previous default_shipping when flag flips to true', async () => {
      const existing = { id: 'addr', userId: 'u1', isDefaultShipping: false } as UserAddress;
      mockTxManager.findOne.mockResolvedValue(existing);
      mockTxManager.save.mockResolvedValue({ ...existing, isDefaultShipping: true });

      await service.update('u1', 'addr', { isDefaultShipping: true });

      expect(mockTxManager.update).toHaveBeenCalledWith(
        UserAddress,
        { userId: 'u1', isDefaultShipping: true },
        { isDefaultShipping: false },
      );
      expect(mockTxManager.save).toHaveBeenCalled();
    });

    it('does NOT clear default_shipping when flag stays true (already default)', async () => {
      const existing = { id: 'addr', userId: 'u1', isDefaultShipping: true } as UserAddress;
      mockTxManager.findOne.mockResolvedValue(existing);
      mockTxManager.save.mockResolvedValue(existing);

      await service.update('u1', 'addr', { isDefaultShipping: true });

      expect(mockTxManager.update).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('throws NotFound if the address does not belong to the user', async () => {
      mockTxManager.findOne.mockResolvedValue(null);
      await expect(service.delete('u1', 'addr')).rejects.toThrow(RpcException);
    });

    it('hard deletes when ownership is confirmed', async () => {
      mockTxManager.findOne.mockResolvedValue({ id: 'addr', userId: 'u1' } as UserAddress);
      mockTxManager.delete.mockResolvedValue({ affected: 1 });

      await service.delete('u1', 'addr');

      expect(mockTxManager.delete).toHaveBeenCalledWith(UserAddress, { id: 'addr', userId: 'u1' });
    });
  });
});
