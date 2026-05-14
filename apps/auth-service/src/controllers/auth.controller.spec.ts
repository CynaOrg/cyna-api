import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from '../services/auth.service';
import { Language } from '@cyna-api/common';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: Partial<AuthService>;

  beforeEach(async () => {
    authService = {
      register: jest.fn().mockResolvedValue({
        message: 'Registration successful. Please check your email to verify your account.',
        user: {
          id: 'user-123',
          email: 'test@example.com',
          firstName: 'John',
          lastName: 'Doe',
          preferredLanguage: Language.FR,
          isVerified: false,
          createdAt: new Date(),
        },
      }),
      validateUser: jest.fn().mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        expiresIn: 900,
        user: {
          id: 'user-123',
          email: 'test@example.com',
          firstName: 'John',
          lastName: 'Doe',
          preferredLanguage: Language.FR,
          isVerified: true,
          createdAt: new Date(),
        },
      }),
      verifyEmail: jest.fn().mockResolvedValue({ success: true, message: 'Email verified' }),
      resendVerification: jest.fn().mockResolvedValue({ success: true, message: 'Email sent' }),
      forgotPassword: jest.fn().mockResolvedValue({ success: true, message: 'Email sent' }),
      resetPassword: jest.fn().mockResolvedValue({ success: true, message: 'Password reset' }),
      refreshToken: jest.fn().mockResolvedValue({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        expiresIn: 900,
        user: {},
      }),
      logout: jest.fn().mockResolvedValue({ success: true }),
      revokeAllUserRefreshTokens: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: authService,
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('registerUser', () => {
    it('should register a new user', async () => {
      const dto = {
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'John',
        lastName: 'Doe',
      };

      const result = await controller.registerUser(dto);

      expect(result.message).toBeDefined();
      expect(result.user).toBeDefined();
      expect(authService.register).toHaveBeenCalledWith(dto);
    });
  });

  describe('validateUser', () => {
    it('should validate user credentials', async () => {
      const dto = {
        email: 'test@example.com',
        password: 'Password123!',
      };

      const result = await controller.validateUser(dto);

      expect(result.accessToken).toBe('access-token');
      expect(authService.validateUser).toHaveBeenCalledWith(dto);
    });
  });

  describe('verifyEmail', () => {
    it('should verify email', async () => {
      const dto = { token: 'verification-token' };

      const result = await controller.verifyEmail(dto);

      expect(result.success).toBe(true);
      expect(authService.verifyEmail).toHaveBeenCalledWith('verification-token');
    });
  });

  describe('forgotPassword', () => {
    it('should initiate password reset', async () => {
      const dto = { email: 'test@example.com' };

      const result = await controller.forgotPassword(dto);

      expect(result.success).toBe(true);
      expect(authService.forgotPassword).toHaveBeenCalledWith('test@example.com');
    });
  });

  describe('resetPassword', () => {
    it('should reset password', async () => {
      const dto = { token: 'reset-token', newPassword: 'NewPassword123!' };

      const result = await controller.resetPassword(dto);

      expect(result.success).toBe(true);
      expect(authService.resetPassword).toHaveBeenCalledWith('reset-token', 'NewPassword123!');
    });
  });

  describe('refreshToken', () => {
    it('should refresh access token', async () => {
      const dto = { refreshToken: 'refresh-token' };

      const result = await controller.refreshToken(dto);

      expect(result.accessToken).toBe('new-access-token');
      expect(authService.refreshToken).toHaveBeenCalledWith('refresh-token');
    });
  });

  describe('logout', () => {
    it('should logout user', async () => {
      const dto = { userId: 'user-123', refreshToken: 'refresh-token' };

      const result = await controller.logout(dto);

      expect(result.success).toBe(true);
      expect(authService.logout).toHaveBeenCalledWith('user-123', 'refresh-token');
    });
  });

  describe('resendVerification', () => {
    it('should resend verification email', async () => {
      const dto = { email: 'test@example.com' };

      const result = await controller.resendVerification(dto);

      expect(result.success).toBe(true);
      expect(authService.resendVerification).toHaveBeenCalledWith('test@example.com');
    });
  });

  describe('handleUserDeleted', () => {
    it('should revoke all refresh tokens on user deletion', async () => {
      await controller.handleUserDeleted({ userId: 'user-123' });

      expect(authService.revokeAllUserRefreshTokens).toHaveBeenCalledWith('user-123');
    });

    it('should swallow errors and not throw when revoke fails', async () => {
      (authService.revokeAllUserRefreshTokens as jest.Mock).mockRejectedValueOnce(
        new Error('db failure'),
      );

      await expect(controller.handleUserDeleted({ userId: 'user-fail' })).resolves.toBeUndefined();
      expect(authService.revokeAllUserRefreshTokens).toHaveBeenCalledWith('user-fail');
    });
  });

  describe('handleUserPasswordChanged', () => {
    it('should revoke all refresh tokens on password change', async () => {
      await controller.handleUserPasswordChanged({ userId: 'user-123' });

      expect(authService.revokeAllUserRefreshTokens).toHaveBeenCalledWith('user-123');
    });

    it('should swallow errors when revoke fails', async () => {
      (authService.revokeAllUserRefreshTokens as jest.Mock).mockRejectedValueOnce(
        new Error('db failure'),
      );

      await expect(
        controller.handleUserPasswordChanged({ userId: 'user-fail' }),
      ).resolves.toBeUndefined();
    });
  });
});
