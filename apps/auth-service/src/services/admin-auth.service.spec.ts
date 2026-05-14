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
      // adminLogin reads via createQueryBuilder().addSelect('admin.passwordHash')
      // since the column is select:false. We make the QB getOne() delegate to
      // findOne so the existing mockResolvedValueOnce setups keep working.
      createQueryBuilder: jest.fn(() => ({
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn(() => (adminRepository.findOne as jest.Mock)()),
      })),
    } as unknown as Partial<Repository<Admin>>;

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

  describe('adminLogin - 2FA code dispatch (228-278 region)', () => {
    it('should generate 2FA code and publish event with admin metadata', async () => {
      // Build a fresh admin so prior tests that mutate `mockAdmin.firstName` via
      // the service's in-place assignment do not pollute this assertion.
      const freshAdmin: Partial<Admin> = {
        id: 'admin-123',
        email: 'admin@example.com',
        passwordHash: 'hashed-password',
        firstName: 'Admin',
        lastName: 'User',
        role: AdminRole.SUPER_ADMIN,
        isActive: true,
      };
      (adminRepository.findOne as jest.Mock).mockResolvedValueOnce(freshAdmin);

      await service.adminLogin({ email: 'admin@example.com', password: 'Password123!' });

      expect(twoFactorService.createCode).toHaveBeenCalledWith('admin-123');
      expect(authEventsPublisher.emitAdmin2FACodeRequested).toHaveBeenCalledWith(
        expect.objectContaining({
          adminId: 'admin-123',
          email: 'admin@example.com',
          firstName: 'Admin',
          code: '123456',
          expiresInMinutes: 5,
        }),
      );
      expect(tokenService.generateTempToken).toHaveBeenCalledWith(
        expect.objectContaining({ sub: 'admin-123', purpose: '2fa' }),
      );
    });
  });

  describe('verify2FA - additional branches', () => {
    const verify2FADto = { tempToken: 'temp-token', code: '123456' };

    it('should throw 404 ADMIN_NOT_FOUND when temp token sub matches no admin (line 112)', async () => {
      (adminRepository.findOne as jest.Mock).mockResolvedValueOnce(null);

      try {
        await service.verify2FA(verify2FADto);
        fail('expected RpcException');
      } catch (err) {
        expect((err as RpcException).getError()).toMatchObject({
          statusCode: 404,
          code: 'ADMIN_NOT_FOUND',
        });
      }
    });

    it('should throw 403 ACCOUNT_DISABLED when admin is inactive (line 120)', async () => {
      (adminRepository.findOne as jest.Mock).mockResolvedValueOnce({
        ...mockAdmin,
        isActive: false,
      });

      try {
        await service.verify2FA(verify2FADto);
        fail('expected RpcException');
      } catch (err) {
        expect((err as RpcException).getError()).toMatchObject({
          statusCode: 403,
          code: 'ACCOUNT_DISABLED',
        });
      }
    });

    it('should update lastLoginAt on successful 2FA verification', async () => {
      (adminRepository.findOne as jest.Mock).mockResolvedValueOnce({ ...mockAdmin });

      await service.verify2FA(verify2FADto);

      expect(adminRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ lastLoginAt: expect.any(Date) }),
      );
    });
  });

  describe('resend2FA - additional branches', () => {
    it('should throw 401 INVALID_TOKEN_PURPOSE when token has wrong purpose (line 174)', async () => {
      (tokenService.verifyTempToken as jest.Mock).mockReturnValueOnce({
        sub: 'admin-123',
        email: 'admin@example.com',
        purpose: 'reset',
      });

      try {
        await service.resend2FA('bad-token');
        fail('expected RpcException');
      } catch (err) {
        expect((err as RpcException).getError()).toMatchObject({
          statusCode: 401,
          code: 'INVALID_TOKEN_PURPOSE',
        });
      }
    });

    it('should throw 404 ADMIN_NOT_FOUND when admin missing (line 186)', async () => {
      (adminRepository.findOne as jest.Mock).mockResolvedValueOnce(null);

      try {
        await service.resend2FA('temp-token');
        fail('expected RpcException');
      } catch (err) {
        expect((err as RpcException).getError()).toMatchObject({
          statusCode: 404,
          code: 'ADMIN_NOT_FOUND',
        });
      }
    });

    it('should throw 403 ACCOUNT_DISABLED when admin inactive (line 194)', async () => {
      (adminRepository.findOne as jest.Mock).mockResolvedValueOnce({
        ...mockAdmin,
        isActive: false,
      });

      try {
        await service.resend2FA('temp-token');
        fail('expected RpcException');
      } catch (err) {
        expect((err as RpcException).getError()).toMatchObject({
          statusCode: 403,
          code: 'ACCOUNT_DISABLED',
        });
      }
    });
  });

  describe('refreshToken (227-284)', () => {
    const refreshTokenValue = 'raw-refresh-token';

    it('should return INVALID_REFRESH_TOKEN when token not in DB', async () => {
      (refreshTokenRepository.findOne as jest.Mock).mockResolvedValueOnce(null);

      try {
        await service.refreshToken(refreshTokenValue);
        fail('expected RpcException');
      } catch (err) {
        expect((err as RpcException).getError()).toMatchObject({
          statusCode: 401,
          code: 'INVALID_REFRESH_TOKEN',
        });
      }
    });

    it('should return INVALID_REFRESH_TOKEN when stored token has no admin relation', async () => {
      (refreshTokenRepository.findOne as jest.Mock).mockResolvedValueOnce({
        id: 'rt-1',
        token: 'hashed-token',
        admin: null,
        expiresAt: new Date(Date.now() + 60000),
        revokedAt: null,
      });

      await expect(service.refreshToken(refreshTokenValue)).rejects.toThrow(RpcException);
    });

    it('should throw REFRESH_TOKEN_EXPIRED when token past expiresAt', async () => {
      (refreshTokenRepository.findOne as jest.Mock).mockResolvedValueOnce({
        id: 'rt-1',
        token: 'hashed-token',
        admin: mockAdmin,
        expiresAt: new Date(Date.now() - 60000),
        revokedAt: null,
      });

      try {
        await service.refreshToken(refreshTokenValue);
        fail('expected RpcException');
      } catch (err) {
        expect((err as RpcException).getError()).toMatchObject({
          statusCode: 401,
          code: 'REFRESH_TOKEN_EXPIRED',
        });
      }
    });

    it('should throw ACCOUNT_DISABLED when admin tied to refresh token is inactive', async () => {
      (refreshTokenRepository.findOne as jest.Mock).mockResolvedValueOnce({
        id: 'rt-1',
        token: 'hashed-token',
        admin: { ...mockAdmin, isActive: false },
        expiresAt: new Date(Date.now() + 60000),
        revokedAt: null,
      });

      try {
        await service.refreshToken(refreshTokenValue);
        fail('expected RpcException');
      } catch (err) {
        expect((err as RpcException).getError()).toMatchObject({
          statusCode: 403,
          code: 'ACCOUNT_DISABLED',
        });
      }
    });

    it('should rotate refresh token (revoke old, issue new) and return access token', async () => {
      const stored = {
        id: 'rt-1',
        token: 'hashed-token',
        admin: mockAdmin,
        expiresAt: new Date(Date.now() + 60000),
        revokedAt: null,
      };
      (refreshTokenRepository.findOne as jest.Mock).mockResolvedValueOnce(stored);

      const result = await service.refreshToken(refreshTokenValue);

      expect(refreshTokenRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ revokedAt: expect.any(Date) }),
      );
      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBe('secure-token');
      expect(result.admin.email).toBe('admin@example.com');
    });
  });

  describe('getAdmins / getAdmin / createAdmin / deleteAdmin (330-501)', () => {
    it('getAdmins should return list of admins ordered desc', async () => {
      (adminRepository as Partial<Repository<Admin>>).find = jest
        .fn()
        .mockResolvedValueOnce([mockAdmin]);

      const result = await service.getAdmins();

      expect(result.data).toHaveLength(1);
      expect(adminRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({ order: { createdAt: 'DESC' } }),
      );
    });

    it('getAdmin should throw 404 ADMIN_NOT_FOUND when missing', async () => {
      (adminRepository.findOne as jest.Mock).mockResolvedValueOnce(null);

      try {
        await service.getAdmin('missing');
        fail('expected RpcException');
      } catch (err) {
        expect((err as RpcException).getError()).toMatchObject({
          statusCode: 404,
          code: 'ADMIN_NOT_FOUND',
        });
      }
    });

    it('getAdmin should return admin record when found', async () => {
      (adminRepository.findOne as jest.Mock).mockResolvedValueOnce(mockAdmin);

      const result = await service.getAdmin('admin-123');

      expect(result).toMatchObject({ id: 'admin-123', email: 'admin@example.com' });
    });

    it('createAdmin should throw 409 EMAIL_ALREADY_EXISTS when email taken', async () => {
      (adminRepository.findOne as jest.Mock).mockResolvedValueOnce(mockAdmin);
      (passwordService.hash as unknown) = jest.fn().mockResolvedValue('h');

      try {
        await service.createAdmin({
          email: 'admin@example.com',
          password: 'Password123!',
          firstName: 'F',
          lastName: 'L',
          role: AdminRole.SUPER_ADMIN,
        });
        fail('expected RpcException');
      } catch (err) {
        expect((err as RpcException).getError()).toMatchObject({
          statusCode: 409,
          code: 'EMAIL_ALREADY_EXISTS',
        });
      }
    });

    it('createAdmin should hash password, persist, and return public fields', async () => {
      (adminRepository.findOne as jest.Mock).mockResolvedValueOnce(null);
      (passwordService as Partial<PasswordService>).hash = jest.fn().mockResolvedValue('hashed-pw');
      (adminRepository.create as unknown) = jest.fn().mockReturnValue({ ...mockAdmin });
      (adminRepository.save as jest.Mock).mockResolvedValueOnce({
        ...mockAdmin,
        id: 'new-admin-id',
      });

      const result = await service.createAdmin({
        email: 'new@example.com',
        password: 'Password123!',
        firstName: 'New',
        lastName: 'Adm',
        role: AdminRole.SUPER_ADMIN,
      });

      expect(passwordService.hash).toHaveBeenCalledWith('Password123!');
      expect(result.id).toBe('new-admin-id');
      // Should not leak passwordHash in response
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('deleteAdmin should reject self-deletion with CANNOT_DELETE_SELF (line 474)', async () => {
      try {
        await service.deleteAdmin('admin-123', 'admin-123');
        fail('expected RpcException');
      } catch (err) {
        expect((err as RpcException).getError()).toMatchObject({
          statusCode: 400,
          code: 'CANNOT_DELETE_SELF',
        });
      }
      expect(adminRepository.findOne).not.toHaveBeenCalled();
    });

    it('deleteAdmin should throw 404 when target admin missing', async () => {
      (adminRepository.findOne as jest.Mock).mockResolvedValueOnce(null);

      try {
        await service.deleteAdmin('missing', 'admin-123');
        fail('expected RpcException');
      } catch (err) {
        expect((err as RpcException).getError()).toMatchObject({
          statusCode: 404,
          code: 'ADMIN_NOT_FOUND',
        });
      }
    });

    it('deleteAdmin should hard-remove target admin', async () => {
      const target = { ...mockAdmin, id: 'admin-456' };
      (adminRepository.findOne as jest.Mock).mockResolvedValueOnce(target);
      (adminRepository as Partial<Repository<Admin>>).remove = jest
        .fn()
        .mockResolvedValueOnce(target);

      const result = await service.deleteAdmin('admin-456', 'admin-123');

      expect(adminRepository.remove).toHaveBeenCalledWith(target);
      expect(result.success).toBe(true);
    });
  });

  describe('logout - distinct revocation paths', () => {
    it('with refresh token: revokes only the matching token, not all sessions', async () => {
      await service.logout('admin-123', 'raw-token');

      const callArgs = (refreshTokenRepository.update as jest.Mock).mock.calls[0];
      // Filter should include `token` (single-session revoke), not `adminId`
      expect(callArgs[0]).toHaveProperty('token');
      expect(callArgs[0]).not.toHaveProperty('adminId');
    });

    it('without refresh token: revokes all sessions for the admin', async () => {
      await service.logout('admin-123');

      const callArgs = (refreshTokenRepository.update as jest.Mock).mock.calls[0];
      expect(callArgs[0]).toHaveProperty('adminId', 'admin-123');
      expect(callArgs[0]).not.toHaveProperty('token');
    });
  });
});
