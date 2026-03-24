import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { TwoFactorService } from './two-factor.service';
import { Admin2FACode } from '../entities/admin-2fa-code.entity';

describe('TwoFactorService', () => {
  let service: TwoFactorService;
  let mockRepository: Partial<Repository<Admin2FACode>>;

  beforeEach(async () => {
    mockRepository = {
      create: jest.fn().mockImplementation((entity) => entity),
      save: jest
        .fn()
        .mockImplementation((entity) => Promise.resolve({ id: 'code-123', ...entity })),
      findOne: jest.fn(),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TwoFactorService,
        {
          provide: getRepositoryToken(Admin2FACode),
          useValue: mockRepository,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(5),
          },
        },
      ],
    }).compile();

    service = module.get<TwoFactorService>(TwoFactorService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateCode', () => {
    it('should generate a 6-digit code', () => {
      const code = service.generateCode();

      expect(code).toMatch(/^\d{6}$/);
      expect(parseInt(code, 10)).toBeGreaterThanOrEqual(100000);
      expect(parseInt(code, 10)).toBeLessThanOrEqual(999999);
    });

    it('should generate different codes on each call', () => {
      const codes = new Set<string>();
      for (let i = 0; i < 100; i++) {
        codes.add(service.generateCode());
      }

      expect(codes.size).toBeGreaterThan(90);
    });
  });

  describe('createCode', () => {
    it('should create a new 2FA code', async () => {
      const adminId = 'admin-123';

      const result = await service.createCode(adminId);

      expect(result.code).toMatch(/^\d{6}$/);
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());

      expect(mockRepository.delete).toHaveBeenCalled();
      expect(mockRepository.create).toHaveBeenCalled();
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it('should set expiration to 5 minutes from now', async () => {
      const adminId = 'admin-123';
      const before = Date.now();

      const result = await service.createCode(adminId);

      const after = Date.now();
      const expectedMin = before + 5 * 60 * 1000;
      const expectedMax = after + 5 * 60 * 1000;

      expect(result.expiresAt.getTime()).toBeGreaterThanOrEqual(expectedMin);
      expect(result.expiresAt.getTime()).toBeLessThanOrEqual(expectedMax);
    });
  });

  describe('validateCode', () => {
    it('should return true for valid unexpired code', async () => {
      const adminId = 'admin-123';
      const code = '123456';

      (mockRepository.findOne as jest.Mock).mockResolvedValueOnce({
        id: 'code-123',
        adminId,
        code,
        expiresAt: new Date(Date.now() + 60000),
        usedAt: null,
      });

      const result = await service.validateCode(adminId, code);

      expect(result).toBe(true);
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it('should return false for non-existent code', async () => {
      (mockRepository.findOne as jest.Mock).mockResolvedValueOnce(null);

      const result = await service.validateCode('admin-123', '123456');

      expect(result).toBe(false);
    });

    it('should return false for expired code', async () => {
      (mockRepository.findOne as jest.Mock).mockResolvedValueOnce({
        id: 'code-123',
        adminId: 'admin-123',
        code: '123456',
        expiresAt: new Date(Date.now() - 60000),
        usedAt: null,
      });

      const result = await service.validateCode('admin-123', '123456');

      expect(result).toBe(false);
    });
  });

  describe('invalidatePreviousCodes', () => {
    it('should delete all unused codes for admin', async () => {
      await service.invalidatePreviousCodes('admin-123');

      expect(mockRepository.delete).toHaveBeenCalled();
    });
  });

  describe('cleanupExpiredCodes', () => {
    it('should return number of deleted codes', async () => {
      (mockRepository.delete as jest.Mock).mockResolvedValueOnce({ affected: 5 });

      const result = await service.cleanupExpiredCodes();

      expect(result).toBe(5);
    });
  });

  describe('getCodeExpiryMinutes', () => {
    it('should return configured expiry minutes', () => {
      const minutes = service.getCodeExpiryMinutes();

      expect(minutes).toBe(5);
    });
  });
});
