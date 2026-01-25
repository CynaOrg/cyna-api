import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from '../services/auth.service';
import { Language } from '@cyna-api/common';

describe('AuthController', () => {
  let controller: AuthController;
  let authService: Partial<AuthService>;
  let mockContext: {
    getChannelRef: jest.Mock;
    getMessage: jest.Mock;
  };
  let mockChannel: {
    ack: jest.Mock;
  };

  beforeEach(async () => {
    mockChannel = {
      ack: jest.fn(),
    };

    mockContext = {
      getChannelRef: jest.fn().mockReturnValue(mockChannel),
      getMessage: jest.fn().mockReturnValue({}),
    };

    authService = {
      register: jest.fn().mockResolvedValue({
        accessToken: 'access-token',
        expiresIn: 900,
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
        expiresIn: 900,
        user: {},
      }),
      logout: jest.fn().mockResolvedValue({ success: true }),
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

      const result = await controller.registerUser(dto, mockContext as any);

      expect(result.accessToken).toBe('access-token');
      expect(authService.register).toHaveBeenCalledWith(dto);
      expect(mockChannel.ack).toHaveBeenCalled();
    });
  });

  describe('validateUser', () => {
    it('should validate user credentials', async () => {
      const dto = {
        email: 'test@example.com',
        password: 'Password123!',
      };

      const result = await controller.validateUser(dto, mockContext as any);

      expect(result.accessToken).toBe('access-token');
      expect(authService.validateUser).toHaveBeenCalledWith(dto);
      expect(mockChannel.ack).toHaveBeenCalled();
    });
  });

  describe('verifyEmail', () => {
    it('should verify email', async () => {
      const dto = { token: 'verification-token' };

      const result = await controller.verifyEmail(dto, mockContext as any);

      expect(result.success).toBe(true);
      expect(authService.verifyEmail).toHaveBeenCalledWith('verification-token');
      expect(mockChannel.ack).toHaveBeenCalled();
    });
  });

  describe('forgotPassword', () => {
    it('should initiate password reset', async () => {
      const dto = { email: 'test@example.com' };

      const result = await controller.forgotPassword(dto, mockContext as any);

      expect(result.success).toBe(true);
      expect(authService.forgotPassword).toHaveBeenCalledWith('test@example.com');
      expect(mockChannel.ack).toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    it('should reset password', async () => {
      const dto = { token: 'reset-token', newPassword: 'NewPassword123!' };

      const result = await controller.resetPassword(dto, mockContext as any);

      expect(result.success).toBe(true);
      expect(authService.resetPassword).toHaveBeenCalledWith('reset-token', 'NewPassword123!');
      expect(mockChannel.ack).toHaveBeenCalled();
    });
  });

  describe('refreshToken', () => {
    it('should refresh access token', async () => {
      const dto = { refreshToken: 'refresh-token' };

      const result = await controller.refreshToken(dto, mockContext as any);

      expect(result.accessToken).toBe('new-access-token');
      expect(authService.refreshToken).toHaveBeenCalledWith('refresh-token');
      expect(mockChannel.ack).toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('should logout user', async () => {
      const dto = { userId: 'user-123', refreshToken: 'refresh-token' };

      const result = await controller.logout(dto, mockContext as any);

      expect(result.success).toBe(true);
      expect(authService.logout).toHaveBeenCalledWith('user-123', 'refresh-token');
      expect(mockChannel.ack).toHaveBeenCalled();
    });
  });
});
