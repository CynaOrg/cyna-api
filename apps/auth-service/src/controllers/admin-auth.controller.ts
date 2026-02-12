import { Controller } from '@nestjs/common';
import { MessagePattern, Payload, Ctx, RmqContext } from '@nestjs/microservices';
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
  async adminLogin(@Payload() data: AdminLoginDto, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.adminAuthService.adminLogin(data);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.AUTH.ADMIN_VERIFY_2FA)
  async verify2FA(@Payload() data: Verify2FADto, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.adminAuthService.verify2FA(data);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.AUTH.ADMIN_RESEND_2FA)
  async resend2FA(@Payload() data: Resend2FADto, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.adminAuthService.resend2FA(data.tempToken);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  @MessagePattern({ cmd: 'auth.admin_refresh_token' })
  async refreshToken(@Payload() data: RefreshTokenDto, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.adminAuthService.refreshToken(data.refreshToken);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  @MessagePattern({ cmd: 'auth.admin_logout' })
  async logout(
    @Payload() data: { adminId: string; refreshToken?: string },
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.adminAuthService.logout(data.adminId, data.refreshToken);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.AUTH.ADMIN_GET_USERS)
  async adminGetUsers(
    @Payload() data: { search?: string; page?: number; limit?: number },
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();
    try {
      const result = await this.adminAuthService.adminGetUsers(data);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.AUTH.ADMIN_GET_USER)
  async adminGetUser(@Payload() data: { userId: string }, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();
    try {
      const result = await this.adminAuthService.adminGetUser(data.userId);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.AUTH.ADMIN_UPDATE_USER_STATUS)
  async adminUpdateUserStatus(
    @Payload() data: { userId: string; isActive: boolean },
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();
    try {
      const result = await this.adminAuthService.adminUpdateUserStatus(data.userId, data.isActive);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.AUTH.ADMIN_GET_ADMINS)
  async getAdmins(@Payload() data: Record<string, never>, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();
    try {
      const result = await this.adminAuthService.getAdmins();
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.AUTH.ADMIN_GET_ADMIN)
  async getAdmin(@Payload() data: { adminId: string }, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();
    try {
      const result = await this.adminAuthService.getAdmin(data.adminId);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
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
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();
    try {
      const result = await this.adminAuthService.createAdmin(data);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
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
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();
    try {
      const { adminId, ...updateData } = data;
      const result = await this.adminAuthService.updateAdmin(adminId, updateData);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.AUTH.ADMIN_DELETE_ADMIN)
  async deleteAdmin(
    @Payload() data: { adminId: string; requestAdminId: string },
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();
    try {
      const result = await this.adminAuthService.deleteAdmin(data.adminId, data.requestAdminId);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }
}
