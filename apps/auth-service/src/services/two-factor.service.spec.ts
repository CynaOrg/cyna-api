import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import { TwoFactorService } from './two-factor.service';
import { Admin2FACode } from '../entities/admin-2fa-code.entity';

const sha256 = (value: string): string => createHash('sha256').update(value, 'utf8').digest('hex');

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
    it('should create a new 2FA code and return the cleartext code', async () => {
      const adminId = 'admin-123';

      const result = await service.createCode(adminId);

      expect(result.code).toMatch(/^\d{6}$/);
      expect(result.expiresAt).toBeInstanceOf(Date);
      expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());

      expect(mockRepository.delete).toHaveBeenCalled();
      expect(mockRepository.create).toHaveBeenCalled();
      expect(mockRepository.save).toHaveBeenCalled();
    });

    it('persists the SHA-256 hash, never the cleartext code', async () => {
      const adminId = 'admin-123';

      const result = await service.createCode(adminId);
      const persisted = (mockRepository.save as jest.Mock).mock.calls[0][0];

      expect(persisted.codeHash).toBe(sha256(result.code));
      expect(persisted.codeHash).not.toBe(result.code);
      expect(persisted.codeHash).toHaveLength(64);
      expect('code' in persisted).toBe(false);
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
    it('should return true when the submitted code matches the stored hash', async () => {
      const adminId = 'admin-123';
      const code = '123456';

      (mockRepository.findOne as jest.Mock).mockResolvedValueOnce({
        id: 'code-123',
        adminId,
        codeHash: sha256(code),
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
        codeHash: sha256('123456'),
        expiresAt: new Date(Date.now() - 60000),
        usedAt: null,
      });

      const result = await service.validateCode('admin-123', '123456');

      expect(result).toBe(false);
    });

    it('should increment attempts on wrong code and persist', async () => {
      const stored = {
        id: 'code-123',
        adminId: 'admin-123',
        codeHash: sha256('999999'),
        expiresAt: new Date(Date.now() + 60000),
        usedAt: null,
        attempts: 0,
      };
      (mockRepository.findOne as jest.Mock).mockResolvedValueOnce(stored);

      const result = await service.validateCode('admin-123', '111111');

      expect(result).toBe(false);
      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ attempts: 1, usedAt: null }),
      );
    });

    it('should lock the code (set usedAt) after MAX_2FA_ATTEMPTS failures', async () => {
      const stored = {
        id: 'code-123',
        adminId: 'admin-123',
        codeHash: sha256('999999'),
        expiresAt: new Date(Date.now() + 60000),
        usedAt: null,
        attempts: 4,
      };
      (mockRepository.findOne as jest.Mock).mockResolvedValueOnce(stored);

      const result = await service.validateCode('admin-123', '111111');

      expect(result).toBe(false);
      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ attempts: 5, usedAt: expect.any(Date) }),
      );
    });

    it('should return false when correct code is submitted after lockout (no active code)', async () => {
      // After lockout, usedAt is set so the unused-code lookup returns null
      (mockRepository.findOne as jest.Mock).mockResolvedValueOnce(null);

      const result = await service.validateCode('admin-123', '999999');

      expect(result).toBe(false);
    });

    it('should not match a code submitted as its own hash (no length mismatch crash)', async () => {
      // Defensive: an attacker who sniffs the hash and replays it as the code
      // must still be rejected, because the service re-hashes the input.
      const code = '654321';
      (mockRepository.findOne as jest.Mock).mockResolvedValueOnce({
        id: 'code-123',
        adminId: 'admin-123',
        codeHash: sha256(code),
        expiresAt: new Date(Date.now() + 60000),
        usedAt: null,
        attempts: 0,
      });

      const result = await service.validateCode('admin-123', sha256(code));

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
