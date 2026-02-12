import { Controller, Logger } from '@nestjs/common';
import {
  MessagePattern,
  EventPattern,
  Payload,
  Ctx,
  RmqContext,
  RpcException,
} from '@nestjs/microservices';
import { MESSAGE_PATTERNS } from '@cyna-api/common';
import { AuthService } from '../services';
import { CreateUserDto } from '../dto';
import { LoginUserDto } from '../dto';
import { VerifyEmailDto } from '../dto';
import { ResendVerificationDto } from '../dto';
import { ForgotPasswordDto } from '../dto';
import { ResetPasswordDto } from '../dto';
import { RefreshTokenDto } from '../dto';
import { LogoutDto } from '../dto';
import { UpdateProfileDto } from '../dto';

@Controller()
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}

  @MessagePattern(MESSAGE_PATTERNS.AUTH.REGISTER_USER)
  async registerUser(@Payload() data: CreateUserDto, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.authService.register(data);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.AUTH.VALIDATE_USER)
  async validateUser(@Payload() data: LoginUserDto, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.authService.validateUser(data);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.AUTH.VERIFY_EMAIL)
  async verifyEmail(@Payload() data: VerifyEmailDto, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.authService.verifyEmail(data.token);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.AUTH.RESEND_VERIFICATION)
  async resendVerification(@Payload() data: ResendVerificationDto, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.authService.resendVerification(data.email);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.AUTH.FORGOT_PASSWORD)
  async forgotPassword(@Payload() data: ForgotPasswordDto, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.authService.forgotPassword(data.email);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.AUTH.RESET_PASSWORD)
  async resetPassword(@Payload() data: ResetPasswordDto, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.authService.resetPassword(data.token, data.newPassword);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.AUTH.REFRESH_TOKEN)
  async refreshToken(@Payload() data: RefreshTokenDto, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.authService.refreshToken(data.refreshToken);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.AUTH.LOGOUT)
  async logout(@Payload() data: LogoutDto & { userId: string }, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.authService.logout(data.userId, data.refreshToken);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.AUTH.GET_USER_BY_ID)
  async getUserById(@Payload() data: { userId: string }, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const user = await this.authService.findUserById(data.userId);
      channel.ack(originalMsg);
      if (!user) {
        throw new RpcException({
          statusCode: 404,
          message: 'User not found',
          code: 'USER_NOT_FOUND',
        });
      }
      return user;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.USER.GET_PROFILE)
  async getProfile(@Payload() data: { userId: string }, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.authService.getProfile(data.userId);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.USER.UPDATE_PROFILE)
  async updateProfile(
    @Payload() data: { userId: string } & UpdateProfileDto,
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const { userId, ...profileData } = data;
      const result = await this.authService.updateProfile(userId, profileData);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  @EventPattern('auth.update_stripe_customer_id')
  async updateStripeCustomerId(
    @Payload() data: { userId: string; stripeCustomerId: string },
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      await this.authService.updateStripeCustomerId(data.userId, data.stripeCustomerId);
      channel.ack(originalMsg);
    } catch (error) {
      this.logger.error(`Failed to update stripeCustomerId for user ${data.userId}: ${error}`);
      channel.ack(originalMsg);
    }
  }
}
