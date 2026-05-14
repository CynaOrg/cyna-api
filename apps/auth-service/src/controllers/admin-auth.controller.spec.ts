import { Test, TestingModule } from '@nestjs/testing';
import { AdminAuthController } from './admin-auth.controller';
import { AdminAuthService } from '../services/admin-auth.service';
import { AdminRole } from '@cyna-api/common';

describe('AdminAuthController', () => {
  let controller: AdminAuthController;
  let adminAuthService: Partial<AdminAuthService>;

  beforeEach(async () => {
    adminAuthService = {
      adminLogin: jest.fn().mockResolvedValue({
        requires2FA: true,
        tempToken: 'temp-token',
        message: 'Verification code sent',
      }),
      verify2FA: jest.fn().mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
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
        refreshToken: 'new-refresh-token',
        expiresIn: 900,
        admin: {},
      }),
      logout: jest.fn().mockResolvedValue({ success: true }),
      getMe: jest.fn().mockResolvedValue({
        id: 'admin-123',
        email: 'admin@example.com',
        firstName: 'Admin',
        lastName: 'User',
        role: AdminRole.SUPER_ADMIN,
      }),
      getAdmins: jest.fn().mockResolvedValue([
        { id: 'admin-1', email: 'a@x.com' },
        { id: 'admin-2', email: 'b@x.com' },
      ]),
      getAdmin: jest.fn().mockResolvedValue({
        id: 'admin-123',
        email: 'admin@example.com',
      }),
      createAdmin: jest.fn().mockResolvedValue({
        id: 'admin-new',
        email: 'new@example.com',
      }),
      updateAdmin: jest.fn().mockResolvedValue({
        id: 'admin-123',
        firstName: 'Updated',
      }),
      deleteAdmin: jest.fn().mockResolvedValue({ success: true }),
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

      const result = await controller.adminLogin(dto);

      expect(result.requires2FA).toBe(true);
      expect(result.tempToken).toBe('temp-token');
      expect(adminAuthService.adminLogin).toHaveBeenCalledWith(dto);
    });
  });

  describe('verify2FA', () => {
    it('should verify 2FA code and return auth response', async () => {
      const dto = {
        tempToken: 'temp-token',
        code: '123456',
      };

      const result = await controller.verify2FA(dto);

      expect(result.accessToken).toBe('access-token');
      expect(result.admin.email).toBe('admin@example.com');
      expect(adminAuthService.verify2FA).toHaveBeenCalledWith(dto);
    });
  });

  describe('resend2FA', () => {
    it('should resend 2FA code', async () => {
      const dto = { tempToken: 'temp-token' };

      const result = await controller.resend2FA(dto);

      expect(result.requires2FA).toBe(true);
      expect(result.tempToken).toBe('new-temp-token');
      expect(adminAuthService.resend2FA).toHaveBeenCalledWith('temp-token');
    });
  });

  describe('refreshToken', () => {
    it('should refresh admin access token', async () => {
      const dto = { refreshToken: 'refresh-token' };

      const result = await controller.refreshToken(dto);

      expect(result.accessToken).toBe('new-access-token');
      expect(adminAuthService.refreshToken).toHaveBeenCalledWith('refresh-token');
    });
  });

  describe('logout', () => {
    it('should logout admin', async () => {
      const dto = { adminId: 'admin-123', refreshToken: 'refresh-token' };

      const result = await controller.logout(dto);

      expect(result.success).toBe(true);
      expect(adminAuthService.logout).toHaveBeenCalledWith('admin-123', 'refresh-token');
    });

    it('should logout admin without refresh token', async () => {
      const dto = { adminId: 'admin-123' };

      const result = await controller.logout(dto);

      expect(result.success).toBe(true);
      expect(adminAuthService.logout).toHaveBeenCalledWith('admin-123', undefined);
    });
  });

  describe('getMe', () => {
    it('should return current admin info', async () => {
      const result = await controller.getMe({ adminId: 'admin-123' });

      expect(result.id).toBe('admin-123');
      expect(adminAuthService.getMe).toHaveBeenCalledWith('admin-123');
    });
  });

  describe('getAdmins', () => {
    it('should return list of all admins', async () => {
      const result = await controller.getAdmins({});

      expect(result).toHaveLength(2);
      expect(adminAuthService.getAdmins).toHaveBeenCalled();
    });
  });

  describe('getAdmin', () => {
    it('should return a single admin by id', async () => {
      const result = await controller.getAdmin({ adminId: 'admin-123' });

      expect(result.id).toBe('admin-123');
      expect(adminAuthService.getAdmin).toHaveBeenCalledWith('admin-123');
    });
  });

  describe('createAdmin', () => {
    it('should create a new admin', async () => {
      const dto = {
        email: 'new@example.com',
        password: 'Password123!',
        firstName: 'New',
        lastName: 'Admin',
        role: AdminRole.COMMERCIAL,
      };

      const result = await controller.createAdmin(dto);

      expect(result.id).toBe('admin-new');
      expect(adminAuthService.createAdmin).toHaveBeenCalledWith(dto);
    });
  });

  describe('updateAdmin', () => {
    it('should update admin and pass requestAdminId separately', async () => {
      const dto = {
        adminId: 'admin-123',
        requestAdminId: 'admin-req',
        firstName: 'Updated',
        lastName: 'Name',
        role: AdminRole.COMMERCIAL,
        isActive: true,
      };

      const result = await controller.updateAdmin(dto);

      expect(result.firstName).toBe('Updated');
      expect(adminAuthService.updateAdmin).toHaveBeenCalledWith(
        'admin-123',
        {
          firstName: 'Updated',
          lastName: 'Name',
          role: AdminRole.COMMERCIAL,
          isActive: true,
        },
        'admin-req',
      );
    });

    it('should update admin without requestAdminId', async () => {
      const dto = {
        adminId: 'admin-123',
        firstName: 'Updated',
      };

      await controller.updateAdmin(dto);

      expect(adminAuthService.updateAdmin).toHaveBeenCalledWith(
        'admin-123',
        { firstName: 'Updated' },
        undefined,
      );
    });
  });

  describe('deleteAdmin', () => {
    it('should delete admin', async () => {
      const dto = { adminId: 'admin-123', requestAdminId: 'admin-req' };

      const result = await controller.deleteAdmin(dto);

      expect(result.success).toBe(true);
      expect(adminAuthService.deleteAdmin).toHaveBeenCalledWith('admin-123', 'admin-req');
    });
  });
});
