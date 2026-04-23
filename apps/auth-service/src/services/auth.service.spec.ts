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

    it('should validate user via USER_SERVICE.FIND_BY_EMAIL and return auth response', async () => {
      userClient.send.mockReturnValueOnce(of(credentialsView));

      const result = await service.validateUser(loginDto);

      expect(userClient.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.USER.FIND_BY_EMAIL, {
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
});
