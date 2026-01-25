import { Test, TestingModule } from '@nestjs/testing';
import { AdminAuthController } from './admin-auth.controller';
import { AdminAuthService } from '../services/admin-auth.service';
import { AdminRole } from '@cyna-api/common';

describe('AdminAuthController', () => {
  let controller: AdminAuthController;
  let adminAuthService: Partial<AdminAuthService>;
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

    adminAuthService = {
      adminLogin: jest.fn().mockResolvedValue({
        requires2FA: true,
        tempToken: 'temp-token',
        message: 'Verification code sent',
      }),
      verify2FA: jest.fn().mockResolvedValue({
        accessToken: 'access-token',
        expiresIn: 900,
        admin: {
          id: 'admin-123',
          email: 'admin@example.com',
          firstName: 'Admin',
          lastName: 'User',
          role: AdminRole.SUPER_ADMIN,
        },
      }),
      resend2FA: jest.fn().mockResolvedValue({
        requires2FA: true,
        tempToken: 'new-temp-token',
        message: 'New verification code sent',
      }),
      refreshToken: jest.fn().mockResolvedValue({
        accessToken: 'new-access-token',
        expiresIn: 900,
        admin: {},
      }),
      logout: jest.fn().mockResolvedValue({ success: true }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminAuthController],
      providers: [
        {
          provide: AdminAuthService,
          useValue: adminAuthService,
        },
      ],
    }).compile();

    controller = module.get<AdminAuthController>(AdminAuthController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('adminLogin', () => {
    it('should initiate admin login with 2FA', async () => {
      const dto = {
        email: 'admin@example.com',
        password: 'Password123!',
      };

      const result = await controller.adminLogin(dto, mockContext as any);

      expect(result.requires2FA).toBe(true);
      expect(result.tempToken).toBe('temp-token');
      expect(adminAuthService.adminLogin).toHaveBeenCalledWith(dto);
      expect(mockChannel.ack).toHaveBeenCalled();
    });
  });

  describe('verify2FA', () => {
    it('should verify 2FA code and return auth response', async () => {
      const dto = {
        tempToken: 'temp-token',
        code: '123456',
      };

      const result = await controller.verify2FA(dto, mockContext as any);

      expect(result.accessToken).toBe('access-token');
      expect(result.admin.email).toBe('admin@example.com');
      expect(adminAuthService.verify2FA).toHaveBeenCalledWith(dto);
      expect(mockChannel.ack).toHaveBeenCalled();
    });
  });

  describe('resend2FA', () => {
    it('should resend 2FA code', async () => {
      const dto = { tempToken: 'temp-token' };

      const result = await controller.resend2FA(dto, mockContext as any);

      expect(result.requires2FA).toBe(true);
      expect(result.tempToken).toBe('new-temp-token');
      expect(adminAuthService.resend2FA).toHaveBeenCalledWith('temp-token');
      expect(mockChannel.ack).toHaveBeenCalled();
    });
  });

  describe('refreshToken', () => {
    it('should refresh admin access token', async () => {
      const dto = { refreshToken: 'refresh-token' };

      const result = await controller.refreshToken(dto, mockContext as any);

      expect(result.accessToken).toBe('new-access-token');
      expect(adminAuthService.refreshToken).toHaveBeenCalledWith('refresh-token');
      expect(mockChannel.ack).toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('should logout admin', async () => {
      const dto = { adminId: 'admin-123', refreshToken: 'refresh-token' };

      const result = await controller.logout(dto, mockContext as any);

      expect(result.success).toBe(true);
      expect(adminAuthService.logout).toHaveBeenCalledWith('admin-123', 'refresh-token');
      expect(mockChannel.ack).toHaveBeenCalled();
    });
  });
});
