import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RpcException } from '@nestjs/microservices';
import { Repository } from 'typeorm';
import { AdminAuthService } from './admin-auth.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { TwoFactorService } from './two-factor.service';
import { AuthEventsPublisher } from '../events/auth-events.publisher';
import { Admin } from '../entities/admin.entity';
import { RefreshToken } from '../entities/refresh-token.entity';
import { CynaLoggerService, AdminRole } from '@cyna-api/common';

describe('AdminAuthService', () => {
  let service: AdminAuthService;
  let adminRepository: Partial<Repository<Admin>>;
  let refreshTokenRepository: Partial<Repository<RefreshToken>>;
  let passwordService: Partial<PasswordService>;
  let tokenService: Partial<TokenService>;
  let twoFactorService: Partial<TwoFactorService>;
  let authEventsPublisher: Partial<AuthEventsPublisher>;

  const mockAdmin: Partial<Admin> = {
    id: 'admin-123',
    email: 'admin@example.com',
    passwordHash: 'hashed-password',
    firstName: 'Admin',
    lastName: 'User',
    role: AdminRole.SUPER_ADMIN,
    isActive: true,
    createdAt: new Date(),
  };

  beforeEach(async () => {
    adminRepository = {
      findOne: jest.fn(),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
    };

    refreshTokenRepository = {
      create: jest.fn().mockImplementation((entity) => entity),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    passwordService = {
      compare: jest.fn().mockResolvedValue(true),
    };

    tokenService = {
      generateAccessToken: jest.fn().mockReturnValue('access-token'),
      generateTempToken: jest.fn().mockReturnValue('temp-token'),
      verifyTempToken: jest.fn().mockReturnValue({
        sub: 'admin-123',
        email: 'admin@example.com',
        purpose: '2fa',
      }),
      generateSecureToken: jest.fn().mockReturnValue('secure-token'),
      hashToken: jest.fn().mockReturnValue('hashed-token'),
      getAccessTokenExpirySeconds: jest.fn().mockReturnValue(900),
      getRefreshTokenExpiryMs: jest.fn().mockReturnValue(7 * 24 * 60 * 60 * 1000),
    };

    twoFactorService = {
      createCode: jest.fn().mockResolvedValue({
        code: '123456',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      }),
      validateCode: jest.fn().mockResolvedValue(true),
      getCodeExpiryMinutes: jest.fn().mockReturnValue(5),
    };

    authEventsPublisher = {
      emitAdmin2FACodeRequested: jest.fn().mockResolvedValue(undefined),
      emitAdminLogin: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminAuthService,
        {
          provide: getRepositoryToken(Admin),
          useValue: adminRepository,
        },
        {
          provide: getRepositoryToken(RefreshToken),
          useValue: refreshTokenRepository,
        },
        {
          provide: PasswordService,
          useValue: passwordService,
        },
        {
          provide: TokenService,
          useValue: tokenService,
        },
        {
          provide: TwoFactorService,
          useValue: twoFactorService,
        },
        {
          provide: AuthEventsPublisher,
          useValue: authEventsPublisher,
        },
        {
          provide: CynaLoggerService,
          useValue: {
            log: jest.fn(),
            error: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AdminAuthService>(AdminAuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('adminLogin', () => {
    const loginDto = {
      email: 'admin@example.com',
      password: 'Password123!',
    };

    it('should initiate 2FA and return temp token', async () => {
      (adminRepository.findOne as jest.Mock).mockResolvedValueOnce(mockAdmin);

      const result = await service.adminLogin(loginDto);

      expect(result.requires2FA).toBe(true);
      expect(result.tempToken).toBe('temp-token');
      expect(twoFactorService.createCode).toHaveBeenCalledWith('admin-123');
      expect(authEventsPublisher.emitAdmin2FACodeRequested).toHaveBeenCalled();
    });

    it('should throw RpcException for non-existent admin', async () => {
      (adminRepository.findOne as jest.Mock).mockResolvedValueOnce(null);

      await expect(service.adminLogin(loginDto)).rejects.toThrow(RpcException);
    });

    it('should throw RpcException for disabled admin', async () => {
      (adminRepository.findOne as jest.Mock).mockResolvedValueOnce({
        ...mockAdmin,
        isActive: false,
      });

      await expect(service.adminLogin(loginDto)).rejects.toThrow(RpcException);
    });

    it('should throw RpcException for invalid password', async () => {
      (adminRepository.findOne as jest.Mock).mockResolvedValueOnce(mockAdmin);
      (passwordService.compare as jest.Mock).mockResolvedValueOnce(false);

      await expect(service.adminLogin(loginDto)).rejects.toThrow(RpcException);
    });
  });

  describe('verify2FA', () => {
    const verify2FADto = {
      tempToken: 'temp-token',
      code: '123456',
    };

    it('should verify 2FA and return auth response', async () => {
      (adminRepository.findOne as jest.Mock).mockResolvedValueOnce(mockAdmin);

      const result = await service.verify2FA(verify2FADto);

      expect(result.accessToken).toBe('access-token');
      expect(result.admin.email).toBe('admin@example.com');
      expect(twoFactorService.validateCode).toHaveBeenCalledWith('admin-123', '123456');
      expect(authEventsPublisher.emitAdminLogin).toHaveBeenCalled();
    });

    it('should throw RpcException for invalid temp token', async () => {
      (tokenService.verifyTempToken as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Invalid token');
      });

      await expect(service.verify2FA(verify2FADto)).rejects.toThrow(RpcException);
    });

    it('should throw RpcException for invalid 2FA code', async () => {
      (adminRepository.findOne as jest.Mock).mockResolvedValueOnce(mockAdmin);
      (twoFactorService.validateCode as jest.Mock).mockResolvedValueOnce(false);

      await expect(service.verify2FA(verify2FADto)).rejects.toThrow(RpcException);
    });

    it('should throw RpcException for wrong token purpose', async () => {
      (tokenService.verifyTempToken as jest.Mock).mockReturnValueOnce({
        sub: 'admin-123',
        email: 'admin@example.com',
        purpose: 'other',
      });

      await expect(service.verify2FA(verify2FADto)).rejects.toThrow(RpcException);
    });
  });

  describe('resend2FA', () => {
    it('should resend 2FA code and return new temp token', async () => {
      (adminRepository.findOne as jest.Mock).mockResolvedValueOnce(mockAdmin);

      const result = await service.resend2FA('temp-token');

      expect(result.requires2FA).toBe(true);
      expect(result.tempToken).toBeDefined();
      expect(twoFactorService.createCode).toHaveBeenCalledWith('admin-123');
      expect(authEventsPublisher.emitAdmin2FACodeRequested).toHaveBeenCalled();
    });

    it('should throw RpcException for invalid temp token', async () => {
      (tokenService.verifyTempToken as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Invalid token');
      });

      await expect(service.resend2FA('invalid-token')).rejects.toThrow(RpcException);
    });
  });

  describe('logout', () => {
    it('should logout admin and revoke tokens', async () => {
      const result = await service.logout('admin-123', 'refresh-token');

      expect(result.success).toBe(true);
      expect(refreshTokenRepository.update).toHaveBeenCalled();
    });

    it('should revoke all tokens when no specific token provided', async () => {
      const result = await service.logout('admin-123');

      expect(result.success).toBe(true);
      expect(refreshTokenRepository.update).toHaveBeenCalled();
    });
  });

  describe('getMe', () => {
    it('should return AdminResponseDto for an active admin (incl. isActive, createdAt, lastLoginAt)', async () => {
      const lastLogin = new Date('2026-01-15T10:00:00Z');
      const created = new Date('2025-09-01T08:30:00Z');
      (adminRepository.findOne as jest.Mock).mockResolvedValueOnce({
        ...mockAdmin,
        createdAt: created,
        lastLoginAt: lastLogin,
      });

      const result = await service.getMe('admin-123');

      expect(result).toEqual({
        id: 'admin-123',
        email: 'admin@example.com',
        firstName: 'Admin',
        lastName: 'User',
        role: AdminRole.SUPER_ADMIN,
        isActive: true,
        createdAt: created,
        lastLoginAt: lastLogin,
      });
    });

    it('should normalize undefined lastLoginAt to null', async () => {
      (adminRepository.findOne as jest.Mock).mockResolvedValueOnce({
        ...mockAdmin,
        lastLoginAt: undefined,
      });

      const result = await service.getMe('admin-123');

      expect(result.lastLoginAt).toBeNull();
    });

    it('should throw 404 ADMIN_NOT_FOUND when admin does not exist', async () => {
      (adminRepository.findOne as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      await expect(service.getMe('missing')).rejects.toThrow(RpcException);
      try {
        await service.getMe('missing');
      } catch (err) {
        expect((err as RpcException).getError()).toMatchObject({
          statusCode: 404,
          code: 'ADMIN_NOT_FOUND',
        });
      }
    });

    it('should throw 403 ACCOUNT_DISABLED when admin is inactive', async () => {
      (adminRepository.findOne as jest.Mock)
        .mockResolvedValueOnce({ ...mockAdmin, isActive: false })
        .mockResolvedValueOnce({ ...mockAdmin, isActive: false });

      await expect(service.getMe('admin-123')).rejects.toThrow(RpcException);
      try {
        await service.getMe('admin-123');
      } catch (err) {
        expect((err as RpcException).getError()).toMatchObject({
          statusCode: 403,
          code: 'ACCOUNT_DISABLED',
        });
      }
    });
  });

  describe('updateAdmin', () => {
    it('should reject self-deactivation with CANNOT_DEACTIVATE_SELF', async () => {
      // Guard runs before any repository lookup; findOne must not be called.
      await expect(
        service.updateAdmin('admin-123', { isActive: false }, 'admin-123'),
      ).rejects.toThrow(RpcException);

      try {
        await service.updateAdmin('admin-123', { isActive: false }, 'admin-123');
      } catch (err) {
        expect((err as RpcException).getError()).toMatchObject({
          statusCode: 400,
          code: 'CANNOT_DEACTIVATE_SELF',
        });
      }

      expect(adminRepository.findOne).not.toHaveBeenCalled();
      expect(adminRepository.save).not.toHaveBeenCalled();
    });

    it('should allow self-update when isActive is not being toggled to false', async () => {
      (adminRepository.findOne as jest.Mock).mockResolvedValueOnce(mockAdmin);

      await service.updateAdmin('admin-123', { firstName: 'Renamed' }, 'admin-123');

      expect(adminRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ firstName: 'Renamed' }),
      );
    });

    it('should allow self-update with isActive: true (idempotent reactivation)', async () => {
      (adminRepository.findOne as jest.Mock).mockResolvedValueOnce(mockAdmin);

      await service.updateAdmin('admin-123', { isActive: true }, 'admin-123');

      expect(adminRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: true }),
      );
    });

    it('should allow deactivating another admin', async () => {
      const otherAdmin = { ...mockAdmin, id: 'admin-456' };
      (adminRepository.findOne as jest.Mock).mockResolvedValueOnce(otherAdmin);

      await service.updateAdmin('admin-456', { isActive: false }, 'admin-123');

      expect(adminRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'admin-456', isActive: false }),
      );
    });

    it('should still work when requestAdminId is undefined (legacy callers)', async () => {
      (adminRepository.findOne as jest.Mock).mockResolvedValueOnce(mockAdmin);

      await service.updateAdmin('admin-123', { firstName: 'NoCaller' });

      expect(adminRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ firstName: 'NoCaller' }),
      );
    });

    it('should throw 404 ADMIN_NOT_FOUND when target admin does not exist', async () => {
      (adminRepository.findOne as jest.Mock).mockResolvedValueOnce(null);

      await expect(service.updateAdmin('missing', { firstName: 'X' }, 'admin-123')).rejects.toThrow(
        RpcException,
      );

      try {
        await service.updateAdmin('missing', { firstName: 'X' }, 'admin-123');
      } catch (err) {
        expect((err as RpcException).getError()).toMatchObject({
          statusCode: 404,
          code: 'ADMIN_NOT_FOUND',
        });
      }
    });
  });
});
