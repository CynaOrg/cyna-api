import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { MESSAGE_PATTERNS, AdminRole } from '@cyna-api/common';
import { AdminAuthService } from '../services/admin-auth.service';
import { AdminLoginDto } from '../dto/admin-login.dto';
import { Verify2FADto } from '../dto/verify-2fa.dto';
import { Resend2FADto } from '../dto/resend-2fa.dto';
import { RefreshTokenDto } from '../dto/refresh-token.dto';

@Controller()
export class AdminAuthController {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  @MessagePattern(MESSAGE_PATTERNS.AUTH.ADMIN_LOGIN)
  async adminLogin(@Payload() data: AdminLoginDto) {
    return this.adminAuthService.adminLogin(data);
  }

  @MessagePattern(MESSAGE_PATTERNS.AUTH.ADMIN_VERIFY_2FA)
  async verify2FA(@Payload() data: Verify2FADto) {
    return this.adminAuthService.verify2FA(data);
  }

  @MessagePattern(MESSAGE_PATTERNS.AUTH.ADMIN_RESEND_2FA)
  async resend2FA(@Payload() data: Resend2FADto) {
    return this.adminAuthService.resend2FA(data.tempToken);
  }

  @MessagePattern(MESSAGE_PATTERNS.AUTH.ADMIN_REFRESH_TOKEN)
  async refreshToken(@Payload() data: RefreshTokenDto) {
    return this.adminAuthService.refreshToken(data.refreshToken);
  }

  @MessagePattern(MESSAGE_PATTERNS.AUTH.ADMIN_LOGOUT)
  async logout(@Payload() data: { adminId: string; refreshToken?: string }) {
    return this.adminAuthService.logout(data.adminId, data.refreshToken);
  }

  @MessagePattern(MESSAGE_PATTERNS.AUTH.ADMIN_GET_USERS)
  async adminGetUsers(@Payload() data: { search?: string; page?: number; limit?: number }) {
    return this.adminAuthService.adminGetUsers(data);
  }

  @MessagePattern(MESSAGE_PATTERNS.AUTH.ADMIN_GET_USER)
  async adminGetUser(@Payload() data: { userId: string }) {
    return this.adminAuthService.adminGetUser(data.userId);
  }

  @MessagePattern(MESSAGE_PATTERNS.AUTH.ADMIN_UPDATE_USER_STATUS)
  async adminUpdateUserStatus(@Payload() data: { userId: string; isActive: boolean }) {
    return this.adminAuthService.adminUpdateUserStatus(data.userId, data.isActive);
  }

  @MessagePattern(MESSAGE_PATTERNS.AUTH.ADMIN_GET_ADMINS)
  async getAdmins(@Payload() _data: Record<string, never>) {
    return this.adminAuthService.getAdmins();
  }

  @MessagePattern(MESSAGE_PATTERNS.AUTH.ADMIN_GET_ADMIN)
  async getAdmin(@Payload() data: { adminId: string }) {
    return this.adminAuthService.getAdmin(data.adminId);
  }

  @MessagePattern(MESSAGE_PATTERNS.AUTH.ADMIN_CREATE_ADMIN)
  async createAdmin(
    @Payload()
    data: {
      email: string;
      password: string;
      firstName: string;
      lastName: string;
      role: AdminRole;
    },
  ) {
    return this.adminAuthService.createAdmin(data);
  }

  @MessagePattern(MESSAGE_PATTERNS.AUTH.ADMIN_UPDATE_ADMIN)
  async updateAdmin(
    @Payload()
    data: {
      adminId: string;
      firstName?: string;
      lastName?: string;
      role?: AdminRole;
      isActive?: boolean;
    },
  ) {
    const { adminId, ...updateData } = data;
    return this.adminAuthService.updateAdmin(adminId, updateData);
  }

  @MessagePattern(MESSAGE_PATTERNS.AUTH.ADMIN_DELETE_ADMIN)
  async deleteAdmin(@Payload() data: { adminId: string; requestAdminId: string }) {
    return this.adminAuthService.deleteAdmin(data.adminId, data.requestAdminId);
  }
}
