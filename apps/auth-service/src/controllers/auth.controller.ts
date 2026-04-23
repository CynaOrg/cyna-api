import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, EventPattern, Payload } from '@nestjs/microservices';
import { MESSAGE_PATTERNS, EVENT_PATTERNS } from '@cyna-api/common';
import { AuthService } from '../services';
import { CreateUserDto } from '../dto';
import { LoginUserDto } from '../dto';
import { VerifyEmailDto } from '../dto';
import { ResendVerificationDto } from '../dto';
import { ForgotPasswordDto } from '../dto';
import { ResetPasswordDto } from '../dto';
import { RefreshTokenDto } from '../dto';
import { LogoutDto } from '../dto';

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

  /**
   * Revoke every refresh token for a user when user-service soft-deletes them.
   * Fire-and-forget: swallow errors so user-service isn't blocked on cleanup.
   */
  @EventPattern(EVENT_PATTERNS.USER.DELETED)
  async handleUserDeleted(@Payload() data: { userId: string }) {
    try {
      await this.authService.revokeAllUserRefreshTokens(data.userId);
    } catch (error) {
      this.logger.error(`Failed to revoke tokens on USER.DELETED for ${data.userId}: ${error}`);
    }
  }

  /**
   * Revoke every refresh token for a user when user-service reports a password
   * change so existing sessions on other devices are forced to re-authenticate.
   */
  @EventPattern(EVENT_PATTERNS.USER.PASSWORD_CHANGED)
  async handleUserPasswordChanged(@Payload() data: { userId: string }) {
    try {
      await this.authService.revokeAllUserRefreshTokens(data.userId);
    } catch (error) {
      this.logger.error(
        `Failed to revoke tokens on USER.PASSWORD_CHANGED for ${data.userId}: ${error}`,
      );
    }
  }
}
