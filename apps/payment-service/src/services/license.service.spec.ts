import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { LicenseService, OrderItemWithProduct } from './license.service';
import { LicenseKey } from '../entities/license-key.entity';
import { LicenseKeyStatus } from '@cyna-api/common';

describe('LicenseService', () => {
  let service: LicenseService;
  let licenseKeyRepository: Partial<Repository<LicenseKey>>;

  const TEST_SNAPSHOT = {
    nameFr: 'Licence Test',
    nameEn: 'Test License',
    slug: 'test-license',
  };

  beforeEach(async () => {
    licenseKeyRepository = {
      create: jest.fn().mockImplementation((entity) => ({ id: 'key-123', ...entity })),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
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
        {
          productId: 'prod-1',
          productType: 'license',
          quantity: 2,
          email: 'test@example.com',
          productSnapshot: TEST_SNAPSHOT,
        },
        {
          productId: 'prod-2',
          productType: 'physical',
          quantity: 1,
          email: 'test@example.com',
          productSnapshot: TEST_SNAPSHOT,
        },
        {
          productId: 'prod-3',
          productType: 'saas',
          quantity: 1,
          email: 'test@example.com',
          productSnapshot: TEST_SNAPSHOT,
        },
      ];

      const result = await service.generateForOrder(orderId, items);

      expect(result.length).toBe(2);
      expect(licenseKeyRepository.create).toHaveBeenCalledTimes(2);
      expect(licenseKeyRepository.save).toHaveBeenCalledWith(expect.any(Array));
    });

    it('should generate one key per quantity unit', async () => {
      const items: OrderItemWithProduct[] = [
        {
          productId: 'prod-1',
          productType: 'license',
          quantity: 5,
          email: 'test@example.com',
          productSnapshot: TEST_SNAPSHOT,
        },
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
          productSnapshot: TEST_SNAPSHOT,
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
          activatedAt: null,
          activationTokenHash: expect.any(String),
          activationTokenExpiresAt: expect.any(Date),
        }),
      );
    });

    it('should return raw activation tokens alongside each generated license', async () => {
      const items: OrderItemWithProduct[] = [
        {
          productId: 'prod-1',
          productType: 'license',
          quantity: 2,
          email: 'user@example.com',
          productSnapshot: TEST_SNAPSHOT,
        },
      ];

      const result = await service.generateForOrder(orderId, items);

      expect(result.length).toBe(2);
      for (const issued of result) {
        expect(typeof issued.activationToken).toBe('string');
        expect(issued.activationToken.length).toBeGreaterThan(20);
      }
      // Tokens must be unique per license
      const tokens = new Set(result.map((r) => r.activationToken));
      expect(tokens.size).toBe(result.length);
    });

    it('should set userId to null when not provided', async () => {
      const items: OrderItemWithProduct[] = [
        {
          productId: 'prod-1',
          productType: 'license',
          quantity: 1,
          email: 'guest@example.com',
          productSnapshot: TEST_SNAPSHOT,
        },
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
        {
          productId: 'prod-1',
          productType: 'physical',
          quantity: 3,
          email: 'test@example.com',
          productSnapshot: TEST_SNAPSHOT,
        },
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

  describe('findByIdForUser', () => {
    it('should return license when found and belongs to user', async () => {
      const mockLicense = { id: 'lic-1', userId: 'user-1' } as LicenseKey;
      (licenseKeyRepository.findOne as jest.Mock).mockResolvedValueOnce(mockLicense);

      const result = await service.findByIdForUser('lic-1', 'user-1');

      expect(result).toBe(mockLicense);
      expect(licenseKeyRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'lic-1', userId: 'user-1' },
      });
    });

    it('should throw NotFoundException when license does not exist', async () => {
      (licenseKeyRepository.findOne as jest.Mock).mockResolvedValueOnce(null);
      await expect(service.findByIdForUser('lic-1', 'user-1')).rejects.toThrow('License not found');
    });

    it('should throw NotFoundException when license belongs to another user', async () => {
      // findOne with userId filter returns null if ownership does not match
      (licenseKeyRepository.findOne as jest.Mock).mockResolvedValueOnce(null);
      await expect(service.findByIdForUser('lic-1', 'user-2')).rejects.toThrow('License not found');
    });
  });

  describe('revokeAllForUser', () => {
    it('should return the number of affected rows', async () => {
      (licenseKeyRepository.update as jest.Mock).mockResolvedValueOnce({
        affected: 3,
      });
      const result = await service.revokeAllForUser('user-1');
      expect(result).toBe(3);
      expect(licenseKeyRepository.update).toHaveBeenCalledWith(
        { userId: 'user-1', status: LicenseKeyStatus.ACTIVE },
        { status: LicenseKeyStatus.REVOKED },
      );
    });

    it('should return 0 when user has no active licenses (idempotent)', async () => {
      (licenseKeyRepository.update as jest.Mock).mockResolvedValueOnce({
        affected: 0,
      });
      const result = await service.revokeAllForUser('user-1');
      expect(result).toBe(0);
    });

    it('should not touch licenses that are already revoked', async () => {
      (licenseKeyRepository.update as jest.Mock).mockResolvedValueOnce({
        affected: 0,
      });
      await service.revokeAllForUser('user-1');
      expect(licenseKeyRepository.update).toHaveBeenCalledWith(
        expect.objectContaining({ status: LicenseKeyStatus.ACTIVE }),
        expect.anything(),
      );
    });
  });

  describe('generateForOrder - productSnapshot persistence', () => {
    it('should persist productSnapshot on created license', async () => {
      const snapshot = { nameFr: 'EDR', nameEn: 'EDR', slug: 'edr' };
      const items: OrderItemWithProduct[] = [
        {
          productId: 'p1',
          productType: 'license',
          quantity: 1,
          email: 'e@x.com',
          productSnapshot: snapshot,
        },
      ];
      await service.generateForOrder('order-1', items);
      expect(licenseKeyRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ productSnapshot: snapshot }),
      );
    });
  });

  describe('activate', () => {
    const items: OrderItemWithProduct[] = [
      {
        productId: 'prod-1',
        productType: 'license',
        quantity: 1,
        email: 'user@example.com',
        productSnapshot: TEST_SNAPSHOT,
      },
    ];

    it('activates a license matching the raw token, clearing the hash/expiry', async () => {
      const [issued] = await service.generateForOrder('order-123', items);
      const persisted = issued.license as unknown as LicenseKey;
      (licenseKeyRepository.findOne as jest.Mock).mockResolvedValueOnce(persisted);

      const before = Date.now();
      const result = await service.activate(issued.activationToken);
      const after = Date.now();

      expect(result.activatedAt).toBeInstanceOf(Date);
      expect(result.activatedAt!.getTime()).toBeGreaterThanOrEqual(before);
      expect(result.activatedAt!.getTime()).toBeLessThanOrEqual(after);
      expect(result.activationTokenHash).toBeNull();
      expect(result.activationTokenExpiresAt).toBeNull();
      expect(licenseKeyRepository.save).toHaveBeenCalledWith(persisted);
    });

    it('throws NotFoundException when token does not match any license', async () => {
      (licenseKeyRepository.findOne as jest.Mock).mockResolvedValueOnce(null);
      await expect(service.activate('bogus-token')).rejects.toThrow(
        'Invalid or expired activation link',
      );
    });

    it('throws NotFoundException when the token has expired', async () => {
      const expired = {
        id: 'lic-1',
        activationTokenHash: 'x',
        activationTokenExpiresAt: new Date(Date.now() - 1000),
      } as LicenseKey;
      (licenseKeyRepository.findOne as jest.Mock).mockResolvedValueOnce(expired);

      await expect(service.activate('any-token')).rejects.toThrow(
        'Invalid or expired activation link',
      );
      expect(licenseKeyRepository.save).not.toHaveBeenCalled();
    });
  });
});
