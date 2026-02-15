import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, EventPattern, Payload, RpcException } from '@nestjs/microservices';
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
import {
  UpdateProfileDto,
  UpdatePasswordDto,
  UpdateLanguageDto,
  DeleteAccountDto,
} from '@cyna-api/common';

@Controller()
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}

  @MessagePattern(MESSAGE_PATTERNS.AUTH.REGISTER_USER)
  async registerUser(@Payload() data: CreateUserDto) {
    return this.authService.register(data);
  }

  @MessagePattern(MESSAGE_PATTERNS.AUTH.VALIDATE_USER)
  async validateUser(@Payload() data: LoginUserDto) {
    return this.authService.validateUser(data);
  }

  @MessagePattern(MESSAGE_PATTERNS.AUTH.VERIFY_EMAIL)
  async verifyEmail(@Payload() data: VerifyEmailDto) {
    return this.authService.verifyEmail(data.token);
  }

  @MessagePattern(MESSAGE_PATTERNS.AUTH.RESEND_VERIFICATION)
  async resendVerification(@Payload() data: ResendVerificationDto) {
    return this.authService.resendVerification(data.email);
  }

  @MessagePattern(MESSAGE_PATTERNS.AUTH.FORGOT_PASSWORD)
  async forgotPassword(@Payload() data: ForgotPasswordDto) {
    return this.authService.forgotPassword(data.email);
  }

  @MessagePattern(MESSAGE_PATTERNS.AUTH.RESET_PASSWORD)
  async resetPassword(@Payload() data: ResetPasswordDto) {
    return this.authService.resetPassword(data.token, data.newPassword);
  }

  @MessagePattern(MESSAGE_PATTERNS.AUTH.REFRESH_TOKEN)
  async refreshToken(@Payload() data: RefreshTokenDto) {
    return this.authService.refreshToken(data.refreshToken);
  }

  @MessagePattern(MESSAGE_PATTERNS.AUTH.LOGOUT)
  async logout(@Payload() data: LogoutDto & { userId: string }) {
    return this.authService.logout(data.userId, data.refreshToken);
  }

  @MessagePattern(MESSAGE_PATTERNS.AUTH.GET_USER_BY_ID)
  async getUserById(@Payload() data: { userId: string }) {
    const user = await this.authService.findUserById(data.userId);
    if (!user) {
      throw new RpcException({
        statusCode: 404,
        message: 'User not found',
        code: 'USER_NOT_FOUND',
      });
    }
    return user;
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

  @MessagePattern(MESSAGE_PATTERNS.USER.UPDATE_PASSWORD)
  async updatePassword(
    @Payload() data: { userId: string } & UpdatePasswordDto,
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const { userId, ...passwordData } = data;
      const result = await this.authService.updatePassword(userId, passwordData);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.USER.UPDATE_LANGUAGE)
  async updateLanguage(
    @Payload() data: { userId: string } & UpdateLanguageDto,
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const { userId, ...languageData } = data;
      const result = await this.authService.updateLanguage(userId, languageData);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.USER.DELETE_ACCOUNT)
  async deleteAccount(
    @Payload() data: { userId: string } & DeleteAccountDto,
    @Ctx() context: RmqContext,
  ) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const { userId, ...deleteData } = data;
      const result = await this.authService.deleteAccount(userId, deleteData);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  @EventPattern('auth.update_stripe_customer_id')
  async updateStripeCustomerId(@Payload() data: { userId: string; stripeCustomerId: string }) {
    try {
      await this.authService.updateStripeCustomerId(data.userId, data.stripeCustomerId);
    } catch (error) {
      this.logger.error(`Failed to update stripeCustomerId for user ${data.userId}: ${error}`);
    }
  }
}
