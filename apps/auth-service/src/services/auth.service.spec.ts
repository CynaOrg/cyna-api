import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { RpcException } from '@nestjs/microservices';
import { Repository } from 'typeorm';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { AuthEventsPublisher } from '../events/auth-events.publisher';
import { User } from '../entities/user.entity';
import { EmailVerificationToken } from '../entities/email-verification-token.entity';
import { PasswordResetToken } from '../entities/password-reset-token.entity';
import { RefreshToken } from '../entities/refresh-token.entity';
import { CynaLoggerService, Language } from '@cyna-api/common';

describe('AuthService', () => {
  let service: AuthService;
  let userRepository: Partial<Repository<User>>;
  let emailVerificationTokenRepository: Partial<Repository<EmailVerificationToken>>;
  let passwordResetTokenRepository: Partial<Repository<PasswordResetToken>>;
  let refreshTokenRepository: Partial<Repository<RefreshToken>>;
  let passwordService: Partial<PasswordService>;
  let tokenService: Partial<TokenService>;
  let authEventsPublisher: Partial<AuthEventsPublisher>;

  const mockUser: Partial<User> = {
    id: 'user-123',
    email: 'test@example.com',
    passwordHash: 'hashed-password',
    firstName: 'John',
    lastName: 'Doe',
    isActive: true,
    isVerified: true,
    preferredLanguage: Language.FR,
    createdAt: new Date(),
  };

  beforeEach(async () => {
    userRepository = {
      findOne: jest.fn(),
      create: jest.fn().mockImplementation((entity) => ({ id: 'user-123', ...entity })),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
    };

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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: getRepositoryToken(User),
          useValue: userRepository,
        },
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

    it('should register a new user successfully', async () => {
      (userRepository.findOne as jest.Mock).mockResolvedValueOnce(null);

      const result = await service.register(createUserDto);

      expect(result.accessToken).toBe('access-token');
      expect(result.expiresIn).toBe(900);
      expect(result.user.email).toBe('new@example.com');
      expect(passwordService.hash).toHaveBeenCalledWith('Password123!');
      expect(authEventsPublisher.emitUserRegistered).toHaveBeenCalled();
    });

    it('should throw RpcException if email already exists', async () => {
      (userRepository.findOne as jest.Mock).mockResolvedValueOnce(mockUser);

      await expect(service.register(createUserDto)).rejects.toThrow(RpcException);
    });
  });

  describe('validateUser', () => {
    const loginDto = {
      email: 'test@example.com',
      password: 'Password123!',
    };

    it('should validate user and return auth response', async () => {
      (userRepository.findOne as jest.Mock).mockResolvedValueOnce(mockUser);

      const result = await service.validateUser(loginDto);

      expect(result.accessToken).toBe('access-token');
      expect(result.user.email).toBe('test@example.com');
      expect(authEventsPublisher.emitUserLogin).toHaveBeenCalled();
    });

    it('should throw RpcException for non-existent user', async () => {
      (userRepository.findOne as jest.Mock).mockResolvedValueOnce(null);

      await expect(service.validateUser(loginDto)).rejects.toThrow(RpcException);
    });

    it('should throw RpcException for disabled account', async () => {
      (userRepository.findOne as jest.Mock).mockResolvedValueOnce({
        ...mockUser,
        isActive: false,
      });

      await expect(service.validateUser(loginDto)).rejects.toThrow(RpcException);
    });

    it('should throw RpcException for invalid password', async () => {
      (userRepository.findOne as jest.Mock).mockResolvedValueOnce(mockUser);
      (passwordService.compare as jest.Mock).mockResolvedValueOnce(false);

      await expect(service.validateUser(loginDto)).rejects.toThrow(RpcException);
    });

    it('should throw RpcException for unverified email', async () => {
      (userRepository.findOne as jest.Mock).mockResolvedValueOnce({
        ...mockUser,
        isVerified: false,
      });

      await expect(service.validateUser(loginDto)).rejects.toThrow(RpcException);
    });
  });

  describe('verifyEmail', () => {
    it('should verify email successfully', async () => {
      const mockToken = {
        userId: 'user-123',
        token: 'hashed-token',
        expiresAt: new Date(Date.now() + 60000),
        verifiedAt: null,
      };

      (emailVerificationTokenRepository.findOne as jest.Mock).mockResolvedValueOnce(mockToken);
      (userRepository.findOne as jest.Mock).mockResolvedValueOnce(mockUser);

      const result = await service.verifyEmail('raw-token');

      expect(result.success).toBe(true);
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
      (userRepository.findOne as jest.Mock).mockResolvedValueOnce(mockUser);

      const result = await service.forgotPassword('test@example.com');

      expect(result.success).toBe(true);
      expect(authEventsPublisher.emitPasswordResetRequested).toHaveBeenCalled();
    });

    it('should return success even for non-existent email (security)', async () => {
      (userRepository.findOne as jest.Mock).mockResolvedValueOnce(null);

      const result = await service.forgotPassword('nonexistent@example.com');

      expect(result.success).toBe(true);
      expect(authEventsPublisher.emitPasswordResetRequested).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    it('should reset password successfully', async () => {
      const mockResetToken = {
        userId: 'user-123',
        token: 'hashed-token',
        expiresAt: new Date(Date.now() + 60000),
        usedAt: null,
      };

      (passwordResetTokenRepository.findOne as jest.Mock).mockResolvedValueOnce(mockResetToken);
      (userRepository.findOne as jest.Mock).mockResolvedValueOnce(mockUser);

      const result = await service.resetPassword('raw-token', 'NewPassword123!');

      expect(result.success).toBe(true);
      expect(passwordService.hash).toHaveBeenCalledWith('NewPassword123!');
      expect(authEventsPublisher.emitPasswordResetCompleted).toHaveBeenCalled();
    });

    it('should throw RpcException for invalid token', async () => {
      (passwordResetTokenRepository.findOne as jest.Mock).mockResolvedValueOnce(null);

      await expect(service.resetPassword('invalid', 'NewPassword123!')).rejects.toThrow(RpcException);
    });
  });

  describe('logout', () => {
    it('should logout user and revoke tokens', async () => {
      const result = await service.logout('user-123', 'refresh-token');

      expect(result.success).toBe(true);
      expect(refreshTokenRepository.update).toHaveBeenCalled();
    });

    it('should revoke all tokens when no specific token provided', async () => {
      const result = await service.logout('user-123');

      expect(result.success).toBe(true);
      expect(refreshTokenRepository.update).toHaveBeenCalled();
    });
  });
});
