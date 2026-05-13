import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { RpcException } from '@nestjs/microservices';
import { Repository } from 'typeorm';
import { of, throwError } from 'rxjs';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { AuthEventsPublisher } from '../events/auth-events.publisher';
import { EmailVerificationToken } from '../entities/email-verification-token.entity';
import { PasswordResetToken } from '../entities/password-reset-token.entity';
import { RefreshToken } from '../entities/refresh-token.entity';
import {
  CynaLoggerService,
  Language,
  MESSAGE_PATTERNS,
  SERVICE_NAMES,
  UserCredentialsView,
  UserProfileView,
} from '@cyna-api/common';

describe('AuthService', () => {
  let service: AuthService;
  let emailVerificationTokenRepository: Partial<Repository<EmailVerificationToken>>;
  let passwordResetTokenRepository: Partial<Repository<PasswordResetToken>>;
  let refreshTokenRepository: Partial<Repository<RefreshToken>>;
  let passwordService: Partial<PasswordService>;
  let tokenService: Partial<TokenService>;
  let authEventsPublisher: Partial<AuthEventsPublisher>;
  let userClient: { send: jest.Mock; emit: jest.Mock };

  const credentialsView: UserCredentialsView = {
    id: 'user-123',
    email: 'test@example.com',
    passwordHash: 'hashed-password',
    firstName: 'John',
    lastName: 'Doe',
    isActive: true,
    isVerified: true,
    preferredLanguage: Language.FR,
  };

  const profileView: UserProfileView = {
    id: 'user-123',
    email: 'test@example.com',
    firstName: 'John',
    lastName: 'Doe',
    companyName: undefined,
    vatNumber: undefined,
    isActive: true,
    isVerified: true,
    preferredLanguage: Language.FR,
    stripeCustomerId: undefined,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    emailVerificationTokenRepository = {
      create: jest.fn().mockImplementation((entity) => entity),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
      findOne: jest.fn(),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    passwordResetTokenRepository = {
      create: jest.fn().mockImplementation((entity) => entity),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
      findOne: jest.fn(),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    refreshTokenRepository = {
      create: jest.fn().mockImplementation((entity) => entity),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    passwordService = {
      hash: jest.fn().mockResolvedValue('hashed-password'),
      compare: jest.fn().mockResolvedValue(true),
    };

    tokenService = {
      generateAccessToken: jest.fn().mockReturnValue('access-token'),
      generateSecureToken: jest.fn().mockReturnValue('secure-token'),
      hashToken: jest.fn().mockReturnValue('hashed-token'),
      getAccessTokenExpirySeconds: jest.fn().mockReturnValue(900),
      getRefreshTokenExpiryMs: jest.fn().mockReturnValue(7 * 24 * 60 * 60 * 1000),
    };

    authEventsPublisher = {
      emitUserRegistered: jest.fn().mockResolvedValue(undefined),
      emitPasswordResetRequested: jest.fn().mockResolvedValue(undefined),
      emitUserVerified: jest.fn().mockResolvedValue(undefined),
      emitUserLogin: jest.fn().mockResolvedValue(undefined),
      emitPasswordResetCompleted: jest.fn().mockResolvedValue(undefined),
    };

    userClient = {
      send: jest.fn().mockReturnValue(of(null)),
      emit: jest.fn().mockReturnValue(of(undefined)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: getRepositoryToken(EmailVerificationToken),
          useValue: emailVerificationTokenRepository,
        },
        {
          provide: getRepositoryToken(PasswordResetToken),
          useValue: passwordResetTokenRepository,
        },
        {
          provide: getRepositoryToken(RefreshToken),
          useValue: refreshTokenRepository,
        },
        {
          provide: SERVICE_NAMES.USER,
          useValue: userClient,
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
          provide: AuthEventsPublisher,
          useValue: authEventsPublisher,
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(24),
          },
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

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('register', () => {
    const createUserDto = {
      email: 'new@example.com',
      password: 'Password123!',
      firstName: 'Jane',
      lastName: 'Smith',
    };

    it('should delegate creation to USER_SERVICE.CREATE with a pre-computed password hash', async () => {
      const createdUser: UserProfileView = { ...profileView, email: createUserDto.email };
      userClient.send.mockReturnValueOnce(of(createdUser));

      const result = await service.register(createUserDto);

      expect(passwordService.hash).toHaveBeenCalledWith('Password123!');
      expect(userClient.send).toHaveBeenCalledWith(
        MESSAGE_PATTERNS.USER.CREATE,
        expect.objectContaining({
          email: createUserDto.email,
          passwordHash: 'hashed-password',
          firstName: 'Jane',
          lastName: 'Smith',
          preferredLanguage: Language.FR,
        }),
      );
      expect(result.message).toBeDefined();
      expect(result.user).toBeDefined();
      expect(authEventsPublisher.emitUserRegistered).toHaveBeenCalled();
      // Email verification token should use the id returned by user-service.
      expect(emailVerificationTokenRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ userId: createdUser.id }),
      );
    });

    it('should propagate RpcException when USER_SERVICE returns EMAIL_EXISTS', async () => {
      userClient.send.mockReturnValueOnce(
        throwError(() => ({ statusCode: 409, code: 'EMAIL_EXISTS', message: 'Email exists' })),
      );

      await expect(service.register(createUserDto)).rejects.toThrow(RpcException);
    });
  });

  describe('validateUser', () => {
    const loginDto = {
      email: 'test@example.com',
      password: 'Password123!',
    };

    it('should validate user via USER_SERVICE.FIND_BY_EMAIL_FOR_LOGIN and return auth response', async () => {
      userClient.send.mockReturnValueOnce(of(credentialsView));

      const result = await service.validateUser(loginDto);

      expect(userClient.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.USER.FIND_BY_EMAIL_FOR_LOGIN, {
        email: loginDto.email,
      });
      expect(result.accessToken).toBe('access-token');
      expect(result.user.email).toBe('test@example.com');
      expect(authEventsPublisher.emitUserLogin).toHaveBeenCalled();
    });

    it('should throw 401 when USER_SERVICE returns null (unknown email)', async () => {
      userClient.send.mockReturnValueOnce(of(null));

      await expect(service.validateUser(loginDto)).rejects.toThrow(RpcException);
    });

    it('should throw 403 when account is disabled', async () => {
      userClient.send.mockReturnValueOnce(of({ ...credentialsView, isActive: false }));

      await expect(service.validateUser(loginDto)).rejects.toThrow(RpcException);
    });

    it('should throw 401 for invalid password', async () => {
      userClient.send.mockReturnValueOnce(of(credentialsView));
      (passwordService.compare as jest.Mock).mockResolvedValueOnce(false);

      await expect(service.validateUser(loginDto)).rejects.toThrow(RpcException);
    });

    it('should throw 403 for unverified email', async () => {
      userClient.send.mockReturnValueOnce(of({ ...credentialsView, isVerified: false }));

      await expect(service.validateUser(loginDto)).rejects.toThrow(RpcException);
    });
  });

  describe('verifyEmail', () => {
    it('should call USER_SERVICE.GET_BY_ID and USER_SERVICE.MARK_VERIFIED', async () => {
      const mockToken = {
        userId: 'user-123',
        token: 'hashed-token',
        expiresAt: new Date(Date.now() + 60000),
        verifiedAt: null,
      };

      (emailVerificationTokenRepository.findOne as jest.Mock).mockResolvedValueOnce(mockToken);
      userClient.send
        .mockReturnValueOnce(of(profileView)) // GET_BY_ID
        .mockReturnValueOnce(of(undefined)); // MARK_VERIFIED

      const result = await service.verifyEmail('raw-token');

      expect(result.success).toBe(true);
      expect(userClient.send).toHaveBeenNthCalledWith(1, MESSAGE_PATTERNS.USER.GET_BY_ID, {
        userId: 'user-123',
      });
      expect(userClient.send).toHaveBeenNthCalledWith(2, MESSAGE_PATTERNS.USER.MARK_VERIFIED, {
        userId: 'user-123',
      });
      expect(authEventsPublisher.emitUserVerified).toHaveBeenCalled();
    });

    it('should throw RpcException for invalid token', async () => {
      (emailVerificationTokenRepository.findOne as jest.Mock).mockResolvedValueOnce(null);

      await expect(service.verifyEmail('invalid-token')).rejects.toThrow(RpcException);
    });

    it('should throw RpcException for expired token', async () => {
      const mockToken = {
        userId: 'user-123',
        token: 'hashed-token',
        expiresAt: new Date(Date.now() - 60000),
        verifiedAt: null,
      };

      (emailVerificationTokenRepository.findOne as jest.Mock).mockResolvedValueOnce(mockToken);

      await expect(service.verifyEmail('expired-token')).rejects.toThrow(RpcException);
    });
  });

  describe('forgotPassword', () => {
    it('should send password reset email for existing user', async () => {
      userClient.send.mockReturnValueOnce(of(credentialsView));

      const result = await service.forgotPassword('test@example.com');

      expect(result.success).toBe(true);
      expect(authEventsPublisher.emitPasswordResetRequested).toHaveBeenCalled();
    });

    it('should return success silently for non-existent email (anti-enumeration)', async () => {
      userClient.send.mockReturnValueOnce(of(null));

      const result = await service.forgotPassword('nonexistent@example.com');

      expect(result.success).toBe(true);
      expect(authEventsPublisher.emitPasswordResetRequested).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    it('should call UPDATE_PASSWORD_HASH and revoke refresh tokens', async () => {
      const mockResetToken = {
        userId: 'user-123',
        token: 'hashed-token',
        expiresAt: new Date(Date.now() + 60000),
        usedAt: null,
      };

      (passwordResetTokenRepository.findOne as jest.Mock).mockResolvedValueOnce(mockResetToken);
      userClient.send
        .mockReturnValueOnce(of(profileView)) // GET_BY_ID
        .mockReturnValueOnce(of(undefined)); // UPDATE_PASSWORD_HASH

      const result = await service.resetPassword('raw-token', 'NewPassword123!');

      expect(result.success).toBe(true);
      expect(passwordService.hash).toHaveBeenCalledWith('NewPassword123!');
      expect(userClient.send).toHaveBeenNthCalledWith(
        2,
        MESSAGE_PATTERNS.USER.UPDATE_PASSWORD_HASH,
        { userId: 'user-123', passwordHash: 'hashed-password' },
      );
      expect(refreshTokenRepository.update).toHaveBeenCalled();
      expect(authEventsPublisher.emitPasswordResetCompleted).toHaveBeenCalled();
    });

    it('should throw RpcException for invalid token', async () => {
      (passwordResetTokenRepository.findOne as jest.Mock).mockResolvedValueOnce(null);

      await expect(service.resetPassword('invalid', 'NewPassword123!')).rejects.toThrow(
        RpcException,
      );
    });
  });

  describe('refreshToken', () => {
    it('should reject inactive users with 403', async () => {
      const storedToken = {
        id: 'rt-1',
        userId: 'user-123',
        token: 'hashed-token',
        expiresAt: new Date(Date.now() + 60000),
        revokedAt: null,
      };

      (refreshTokenRepository.findOne as jest.Mock).mockResolvedValueOnce(storedToken);
      userClient.send.mockReturnValueOnce(of({ ...profileView, isActive: false }));

      await expect(service.refreshToken('raw-token')).rejects.toThrow(RpcException);
      expect(userClient.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.USER.GET_BY_ID, {
        userId: 'user-123',
      });
    });

    it('should issue new tokens for active users', async () => {
      const storedToken = {
        id: 'rt-1',
        userId: 'user-123',
        token: 'hashed-token',
        expiresAt: new Date(Date.now() + 60000),
        revokedAt: null,
      };

      (refreshTokenRepository.findOne as jest.Mock).mockResolvedValueOnce(storedToken);
      userClient.send.mockReturnValueOnce(of(profileView));

      const result = await service.refreshToken('raw-token');

      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBeDefined();
      expect(result.user.email).toBe('test@example.com');
    });
  });

  describe('logout', () => {
    it('should logout user and revoke tokens', async () => {
      const result = await service.logout('user-123', 'refresh-token');

      expect(result.success).toBe(true);
      expect(refreshTokenRepository.update).toHaveBeenCalled();
    });

    it('should return success when no specific token provided', async () => {
      const result = await service.logout('user-123');

      expect(result.success).toBe(true);
    });
  });

  describe('revokeAllUserRefreshTokens', () => {
    it('should mark all non-revoked refresh tokens as revoked for the user', async () => {
      await service.revokeAllUserRefreshTokens('user-123');

      expect(refreshTokenRepository.update).toHaveBeenCalledWith(
        { userId: 'user-123', revokedAt: expect.anything() },
        expect.objectContaining({ revokedAt: expect.any(Date) }),
      );
    });
  });

  describe('callUserService - error translation (lines 74-76)', () => {
    it('should map generic ClientProxy failure to 503 USER_SERVICE_UNAVAILABLE', async () => {
      // No statusCode on the error means we hit the generic branch.
      userClient.send.mockReturnValueOnce(throwError(() => new Error('boom')));

      try {
        await service.register({
          email: 'x@example.com',
          password: 'Password123!',
          firstName: 'X',
          lastName: 'Y',
        });
        fail('expected RpcException');
      } catch (err) {
        expect(err).toBeInstanceOf(RpcException);
        expect((err as RpcException).getError()).toMatchObject({
          statusCode: 503,
          code: 'USER_SERVICE_UNAVAILABLE',
        });
      }
    }, 20000);
  });

  describe('resendVerification - anti-enumeration (236-277)', () => {
    it('should return identical success response when email is unknown (no event emitted)', async () => {
      userClient.send.mockReturnValueOnce(of(null));

      const result = await service.resendVerification('unknown@example.com');

      expect(result.success).toBe(true);
      expect(result.message).toBe('common.messages.verificationEmailSentSilent');
      expect(authEventsPublisher.emitUserRegistered).not.toHaveBeenCalled();
      expect(emailVerificationTokenRepository.save).not.toHaveBeenCalled();
    });

    it('should return identical success response when user is already verified (no event)', async () => {
      userClient.send.mockReturnValueOnce(of({ ...profileView, isVerified: true }));

      const result = await service.resendVerification('test@example.com');

      expect(result.success).toBe(true);
      expect(result.message).toBe('common.messages.verificationEmailSentSilent');
      expect(authEventsPublisher.emitUserRegistered).not.toHaveBeenCalled();
    });

    it('should delete old verification tokens and emit fresh verification event for unverified user', async () => {
      userClient.send.mockReturnValueOnce(of({ ...profileView, isVerified: false }));

      const result = await service.resendVerification('test@example.com');

      expect(emailVerificationTokenRepository.delete).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-123' }),
      );
      expect(emailVerificationTokenRepository.save).toHaveBeenCalled();
      expect(authEventsPublisher.emitUserRegistered).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-123',
          email: 'test@example.com',
          verificationToken: expect.any(String),
        }),
      );
      expect(result.success).toBe(true);
    });

    it('responses for known vs unknown emails should be indistinguishable (security regression guard)', async () => {
      userClient.send.mockReturnValueOnce(of(null));
      const unknownResp = await service.resendVerification('unknown@example.com');

      userClient.send.mockReturnValueOnce(of({ ...profileView, isVerified: true }));
      const verifiedResp = await service.resendVerification('verified@example.com');

      expect(unknownResp).toEqual(verifiedResp);
    });
  });

  describe('forgotPassword - anti-enumeration (line 351)', () => {
    it('should produce indistinguishable responses for unknown vs existing email', async () => {
      userClient.send.mockReturnValueOnce(of(null));
      const unknown = await service.forgotPassword('unknown@example.com');

      userClient.send.mockReturnValueOnce(of(profileView));
      const known = await service.forgotPassword('test@example.com');

      expect(unknown.success).toBe(true);
      expect(known.success).toBe(true);
      expect(unknown.message).toBe(known.message);
    });

    it('should delete previous unused reset tokens before creating a new one', async () => {
      userClient.send.mockReturnValueOnce(of(profileView));

      await service.forgotPassword('test@example.com');

      expect(passwordResetTokenRepository.delete).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-123' }),
      );
      expect(passwordResetTokenRepository.save).toHaveBeenCalled();
    });
  });

  describe('resetPassword - additional branches (407-456)', () => {
    it('should throw TOKEN_EXPIRED when reset token is past expiresAt', async () => {
      (passwordResetTokenRepository.findOne as jest.Mock).mockResolvedValueOnce({
        userId: 'user-123',
        token: 'hashed-token',
        expiresAt: new Date(Date.now() - 60000),
        usedAt: null,
      });

      try {
        await service.resetPassword('expired-token', 'NewPassword123!');
        fail('expected RpcException');
      } catch (err) {
        expect((err as RpcException).getError()).toMatchObject({
          statusCode: 400,
          code: 'TOKEN_EXPIRED',
        });
      }
    });

    it('should mark token as used (usedAt) after successful password reset', async () => {
      const tok = {
        userId: 'user-123',
        token: 'hashed-token',
        expiresAt: new Date(Date.now() + 60000),
        usedAt: null,
      };
      (passwordResetTokenRepository.findOne as jest.Mock).mockResolvedValueOnce(tok);
      userClient.send.mockReturnValueOnce(of(profileView)).mockReturnValueOnce(of(undefined));

      await service.resetPassword('raw-token', 'NewPassword123!');

      expect(passwordResetTokenRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ usedAt: expect.any(Date) }),
      );
    });

    it('should revoke all existing refresh tokens (kill sessions) on reset', async () => {
      (passwordResetTokenRepository.findOne as jest.Mock).mockResolvedValueOnce({
        userId: 'user-123',
        token: 'hashed-token',
        expiresAt: new Date(Date.now() + 60000),
        usedAt: null,
      });
      userClient.send.mockReturnValueOnce(of(profileView)).mockReturnValueOnce(of(undefined));

      await service.resetPassword('raw-token', 'NewPassword123!');

      expect(refreshTokenRepository.update).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-123' }),
        expect.objectContaining({ revokedAt: expect.any(Date) }),
      );
    });
  });

  describe('refreshToken - grace period + edge cases (558-600)', () => {
    it('should throw INVALID_REFRESH_TOKEN when neither active nor grace-period token found', async () => {
      (refreshTokenRepository.findOne as jest.Mock)
        .mockResolvedValueOnce(null) // active lookup
        .mockResolvedValueOnce(null); // grace lookup

      try {
        await service.refreshToken('unknown-token');
        fail('expected RpcException');
      } catch (err) {
        expect((err as RpcException).getError()).toMatchObject({
          statusCode: 401,
          code: 'INVALID_REFRESH_TOKEN',
        });
      }
    });

    it('should issue new pair via grace period when token was recently revoked', async () => {
      const recent = {
        id: 'rt-grace',
        userId: 'user-123',
        token: 'hashed-token',
        expiresAt: new Date(Date.now() + 60000),
        revokedAt: new Date(Date.now() - 1000),
      };
      (refreshTokenRepository.findOne as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(recent);
      userClient.send.mockReturnValueOnce(of(profileView));

      const result = await service.refreshToken('raw-token');

      expect(result.accessToken).toBe('access-token');
      expect(result.refreshToken).toBeDefined();
    });

    it('grace period: should throw INVALID_REFRESH_TOKEN if recovered token lacks userId', async () => {
      const orphan = {
        id: 'rt-grace',
        userId: null,
        token: 'hashed-token',
        expiresAt: new Date(Date.now() + 60000),
        revokedAt: new Date(Date.now() - 1000),
      };
      (refreshTokenRepository.findOne as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(orphan);

      try {
        await service.refreshToken('raw-token');
        fail('expected RpcException');
      } catch (err) {
        expect((err as RpcException).getError()).toMatchObject({
          statusCode: 401,
          code: 'INVALID_REFRESH_TOKEN',
        });
      }
    });

    it('grace period: should throw 403 ACCOUNT_DISABLED if user is inactive', async () => {
      (refreshTokenRepository.findOne as jest.Mock)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 'rt-grace',
          userId: 'user-123',
          token: 'hashed-token',
          expiresAt: new Date(Date.now() + 60000),
          revokedAt: new Date(Date.now() - 1000),
        });
      userClient.send.mockReturnValueOnce(of({ ...profileView, isActive: false }));

      try {
        await service.refreshToken('raw-token');
        fail('expected RpcException');
      } catch (err) {
        expect((err as RpcException).getError()).toMatchObject({
          statusCode: 403,
          code: 'ACCOUNT_DISABLED',
        });
      }
    });

    it('should throw REFRESH_TOKEN_EXPIRED when active token is past expiresAt', async () => {
      (refreshTokenRepository.findOne as jest.Mock).mockResolvedValueOnce({
        id: 'rt-1',
        userId: 'user-123',
        token: 'hashed-token',
        expiresAt: new Date(Date.now() - 60000),
        revokedAt: null,
      });

      try {
        await service.refreshToken('raw-token');
        fail('expected RpcException');
      } catch (err) {
        expect((err as RpcException).getError()).toMatchObject({
          statusCode: 401,
          code: 'REFRESH_TOKEN_EXPIRED',
        });
      }
    });

    it('should throw INVALID_REFRESH_TOKEN when active token has no userId (line 472)', async () => {
      (refreshTokenRepository.findOne as jest.Mock).mockResolvedValueOnce({
        id: 'rt-1',
        userId: null,
        token: 'hashed-token',
        expiresAt: new Date(Date.now() + 60000),
        revokedAt: null,
      });

      try {
        await service.refreshToken('raw-token');
        fail('expected RpcException');
      } catch (err) {
        expect((err as RpcException).getError()).toMatchObject({
          statusCode: 401,
          code: 'INVALID_REFRESH_TOKEN',
        });
      }
    });
  });

  describe('createRefreshToken - max active sessions limit', () => {
    it('should revoke oldest sessions when active sessions reach MAX_ACTIVE_SESSIONS (5)', async () => {
      // 5 existing active sessions => creating one more triggers revocation of the oldest.
      const existing = Array.from({ length: 5 }).map((_, i) => ({
        id: `rt-${i}`,
        createdAt: new Date(2026, 0, i + 1),
      }));
      (refreshTokenRepository.find as jest.Mock).mockResolvedValueOnce(existing);

      const stored = {
        id: 'rt-1',
        userId: 'user-123',
        token: 'hashed-token',
        expiresAt: new Date(Date.now() + 60000),
        revokedAt: null,
      };
      (refreshTokenRepository.findOne as jest.Mock).mockResolvedValueOnce(stored);
      userClient.send.mockReturnValueOnce(of(profileView));

      await service.refreshToken('raw-token');

      // The update call that revokes oldest tokens passes an array of ids.
      const updateCalls = (refreshTokenRepository.update as jest.Mock).mock.calls;
      const arrayCall = updateCalls.find((c) => Array.isArray(c[0]));
      expect(arrayCall).toBeDefined();
      expect(arrayCall![1]).toMatchObject({ revokedAt: expect.any(Date) });
    });
  });

  describe('logout - flows (464, 472)', () => {
    it('with refresh token: revokes single session via update', async () => {
      await service.logout('user-123', 'raw-token');
      const args = (refreshTokenRepository.update as jest.Mock).mock.calls[0];
      expect(args[0]).toHaveProperty('token');
    });

    it('without refresh token: does NOT call update (other devices preserved)', async () => {
      await service.logout('user-123');
      expect(refreshTokenRepository.update).not.toHaveBeenCalled();
    });
  });

  describe('cleanupExpiredTokens (584-600)', () => {
    it('should delete expired verification, reset, and refresh tokens and aggregate counts', async () => {
      (emailVerificationTokenRepository.delete as jest.Mock).mockResolvedValueOnce({ affected: 3 });
      (passwordResetTokenRepository.delete as jest.Mock).mockResolvedValueOnce({ affected: 2 });
      (refreshTokenRepository.delete as jest.Mock).mockResolvedValueOnce({ affected: 4 });

      const result = await service.cleanupExpiredTokens();

      expect(result).toEqual({
        verificationTokens: 3,
        resetTokens: 2,
        refreshTokens: 4,
      });
    });

    it('should default to 0 when affected is undefined', async () => {
      (emailVerificationTokenRepository.delete as jest.Mock).mockResolvedValueOnce({});
      (passwordResetTokenRepository.delete as jest.Mock).mockResolvedValueOnce({});
      (refreshTokenRepository.delete as jest.Mock).mockResolvedValueOnce({});

      const result = await service.cleanupExpiredTokens();

      expect(result).toEqual({
        verificationTokens: 0,
        resetTokens: 0,
        refreshTokens: 0,
      });
    });
  });
});
