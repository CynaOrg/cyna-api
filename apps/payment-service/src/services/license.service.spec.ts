import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LicenseService, OrderItemWithProduct } from './license.service';
import { LicenseKey } from '../entities/license-key.entity';
import { LicenseKeyStatus } from '@cyna-api/common';

describe('LicenseService', () => {
  let service: LicenseService;
  let licenseKeyRepository: Partial<Repository<LicenseKey>>;

  beforeEach(async () => {
    licenseKeyRepository = {
      create: jest.fn().mockImplementation((entity) => ({ id: 'key-123', ...entity })),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
      find: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LicenseService,
        {
          provide: getRepositoryToken(LicenseKey),
          useValue: licenseKeyRepository,
        },
      ],
    }).compile();

    service = module.get<LicenseService>(LicenseService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateKey', () => {
    it('should generate a key with correct CYNA format', () => {
      const key = service.generateKey();
      expect(key).toMatch(/^CYNA-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}-[A-F0-9]{4}$/);
    });

    it('should generate unique keys', () => {
      const keys = new Set<string>();
      for (let i = 0; i < 100; i++) {
        keys.add(service.generateKey());
      }
      expect(keys.size).toBe(100);
    });

    it('should generate a key of exactly 24 characters', () => {
      const key = service.generateKey();
      // CYNA-XXXX-XXXX-XXXX-XXXX = 4 + 1 + 4 + 1 + 4 + 1 + 4 + 1 + 4 = 24
      expect(key.length).toBe(24);
    });

    it('should only contain uppercase hex characters', () => {
      const key = service.generateKey();
      const parts = key.split('-');
      expect(parts[0]).toBe('CYNA');
      for (let i = 1; i < parts.length; i++) {
        expect(parts[i]).toMatch(/^[A-F0-9]{4}$/);
      }
    });
  });

  describe('generateForOrder', () => {
    const orderId = 'order-123';

    it('should generate license keys only for license-type items', async () => {
      const items: OrderItemWithProduct[] = [
        { productId: 'prod-1', productType: 'license', quantity: 2, email: 'test@example.com' },
        { productId: 'prod-2', productType: 'physical', quantity: 1, email: 'test@example.com' },
        { productId: 'prod-3', productType: 'saas', quantity: 1, email: 'test@example.com' },
      ];

      const result = await service.generateForOrder(orderId, items);

      expect(result.length).toBe(2);
      expect(licenseKeyRepository.create).toHaveBeenCalledTimes(2);
      expect(licenseKeyRepository.save).toHaveBeenCalledWith(expect.any(Array));
    });

    it('should generate one key per quantity unit', async () => {
      const items: OrderItemWithProduct[] = [
        { productId: 'prod-1', productType: 'license', quantity: 5, email: 'test@example.com' },
      ];

      const result = await service.generateForOrder(orderId, items);

      expect(result.length).toBe(5);
      expect(licenseKeyRepository.create).toHaveBeenCalledTimes(5);
    });

    it('should set correct properties on generated keys', async () => {
      const items: OrderItemWithProduct[] = [
        {
          productId: 'prod-1',
          productType: 'license',
          quantity: 1,
          email: 'user@example.com',
          userId: 'user-123',
        },
      ];

      await service.generateForOrder(orderId, items);

      expect(licenseKeyRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId,
          productId: 'prod-1',
          userId: 'user-123',
          email: 'user@example.com',
          status: LicenseKeyStatus.ACTIVE,
          activatedAt: expect.any(Date),
        }),
      );
    });

    it('should set userId to null when not provided', async () => {
      const items: OrderItemWithProduct[] = [
        { productId: 'prod-1', productType: 'license', quantity: 1, email: 'guest@example.com' },
      ];

      await service.generateForOrder(orderId, items);

      expect(licenseKeyRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: null,
        }),
      );
    });

    it('should return empty array when no license items exist', async () => {
      const items: OrderItemWithProduct[] = [
        { productId: 'prod-1', productType: 'physical', quantity: 3, email: 'test@example.com' },
      ];

      const result = await service.generateForOrder(orderId, items);

      expect(result.length).toBe(0);
      expect(licenseKeyRepository.save).not.toHaveBeenCalled();
    });

    it('should return empty array for empty items list', async () => {
      const result = await service.generateForOrder(orderId, []);

      expect(result.length).toBe(0);
      expect(licenseKeyRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('findByOrderId', () => {
    it('should call repository find with orderId', async () => {
      const mockKeys = [{ id: 'key-1', orderId: 'order-123' }];
      (licenseKeyRepository.find as jest.Mock).mockResolvedValueOnce(mockKeys);

      const result = await service.findByOrderId('order-123');

      expect(result).toEqual(mockKeys);
      expect(licenseKeyRepository.find).toHaveBeenCalledWith({
        where: { orderId: 'order-123' },
      });
    });
  });

  describe('findByUserId', () => {
    it('should call repository find with userId and order by createdAt DESC', async () => {
      const mockKeys = [{ id: 'key-1', userId: 'user-123' }];
      (licenseKeyRepository.find as jest.Mock).mockResolvedValueOnce(mockKeys);

      const result = await service.findByUserId('user-123');

      expect(result).toEqual(mockKeys);
      expect(licenseKeyRepository.find).toHaveBeenCalledWith({
        where: { userId: 'user-123' },
        order: { createdAt: 'DESC' },
      });
    });
  });

  describe('findByEmail', () => {
    it('should call repository find with email and order by createdAt DESC', async () => {
      const mockKeys = [{ id: 'key-1', email: 'test@example.com' }];
      (licenseKeyRepository.find as jest.Mock).mockResolvedValueOnce(mockKeys);

      const result = await service.findByEmail('test@example.com');

      expect(result).toEqual(mockKeys);
      expect(licenseKeyRepository.find).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
        order: { createdAt: 'DESC' },
      });
    });
  });

  describe('revokeByOrderId', () => {
    it('should update all keys for orderId to REVOKED status', async () => {
      await service.revokeByOrderId('order-123');

      expect(licenseKeyRepository.update).toHaveBeenCalledWith(
        { orderId: 'order-123' },
        { status: LicenseKeyStatus.REVOKED },
      );
    });
  });
});
