import { Controller } from '@nestjs/common';
import { MessagePattern, Payload, Ctx, RmqContext } from '@nestjs/microservices';
import { MESSAGE_PATTERNS } from '@cyna-api/common';
import { AdminAuthService } from '../services/admin-auth.service';
import { AdminLoginDto } from '../dto/admin-login.dto';
import { Verify2FADto } from '../dto/verify-2fa.dto';
import { Resend2FADto } from '../dto/resend-2fa.dto';
import { RefreshTokenDto } from '../dto/refresh-token.dto';

@Controller()
export class AdminAuthController {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  @MessagePattern(MESSAGE_PATTERNS.AUTH.ADMIN_LOGIN)
  async adminLogin(
    @Payload() data: AdminLoginDto,
    @Ctx() context: RmqContext,
  ) {
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
  async verify2FA(
    @Payload() data: Verify2FADto,
    @Ctx() context: RmqContext,
  ) {
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
  async resend2FA(
    @Payload() data: Resend2FADto,
    @Ctx() context: RmqContext,
  ) {
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
  async refreshToken(
    @Payload() data: RefreshTokenDto,
    @Ctx() context: RmqContext,
  ) {
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
}
