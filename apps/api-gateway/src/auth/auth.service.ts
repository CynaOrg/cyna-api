import { Injectable, Inject, HttpException, HttpStatus } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout, catchError, throwError } from 'rxjs';
import { SERVICE_NAMES, MESSAGE_PATTERNS } from '@cyna-api/common';
import {
  RegisterDto,
  LoginDto,
  VerifyEmailDto,
  ResendVerificationDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  RefreshTokenDto,
  LogoutDto,
  AdminLoginDto,
  Verify2FADto,
  Resend2FADto,
} from './dto';

@Injectable()
export class AuthService {
  private readonly TIMEOUT = 10000; // 10 seconds

  constructor(
    @Inject(SERVICE_NAMES.AUTH)
    private readonly authClient: ClientProxy,
  ) {}

  // User Authentication

  async register(dto: RegisterDto) {
    return this.sendMessage(MESSAGE_PATTERNS.AUTH.REGISTER_USER, dto);
  }

  async login(dto: LoginDto) {
    return this.sendMessage(MESSAGE_PATTERNS.AUTH.VALIDATE_USER, dto);
  }

  async verifyEmail(dto: VerifyEmailDto) {
    return this.sendMessage(MESSAGE_PATTERNS.AUTH.VERIFY_EMAIL, dto);
  }

  async resendVerification(dto: ResendVerificationDto) {
    return this.sendMessage(MESSAGE_PATTERNS.AUTH.VERIFY_EMAIL, {
      email: dto.email,
      resend: true
    });
  }

  async forgotPassword(dto: ForgotPasswordDto) {
    return this.sendMessage(MESSAGE_PATTERNS.AUTH.FORGOT_PASSWORD, dto);
  }

  async resetPassword(dto: ResetPasswordDto) {
    return this.sendMessage(MESSAGE_PATTERNS.AUTH.RESET_PASSWORD, dto);
  }

  async refreshToken(dto: RefreshTokenDto) {
    return this.sendMessage(MESSAGE_PATTERNS.AUTH.REFRESH_TOKEN, dto);
  }

  async logout(userId: string, dto: LogoutDto) {
    return this.sendMessage(MESSAGE_PATTERNS.AUTH.LOGOUT, {
      userId,
      refreshToken: dto.refreshToken,
    });
  }

  // Admin Authentication

  async adminLogin(dto: AdminLoginDto) {
    return this.sendMessage(MESSAGE_PATTERNS.AUTH.ADMIN_LOGIN, dto);
  }

  async adminVerify2FA(dto: Verify2FADto) {
    return this.sendMessage(MESSAGE_PATTERNS.AUTH.ADMIN_VERIFY_2FA, dto);
  }

  async adminResend2FA(dto: Resend2FADto) {
    return this.sendMessage(MESSAGE_PATTERNS.AUTH.ADMIN_RESEND_2FA, dto);
  }

  async adminRefreshToken(dto: RefreshTokenDto) {
    return this.sendMessage(MESSAGE_PATTERNS.AUTH.REFRESH_TOKEN, {
      ...dto,
      isAdmin: true,
    });
  }

  async adminLogout(adminId: string, dto: LogoutDto) {
    return this.sendMessage(MESSAGE_PATTERNS.AUTH.LOGOUT, {
      adminId,
      refreshToken: dto.refreshToken,
    });
  }

  // Private helper

  private async sendMessage<T>(pattern: { cmd: string }, data: T) {
    return firstValueFrom(
      this.authClient.send(pattern, data).pipe(
        timeout(this.TIMEOUT),
        catchError((err) => {
          // Convert RpcException errors to HttpException
          if (err && typeof err === 'object' && 'statusCode' in err) {
            const statusCode = err.statusCode || HttpStatus.INTERNAL_SERVER_ERROR;
            const message = err.message || 'An error occurred';
            const code = err.code || 'UNKNOWN_ERROR';

            return throwError(() => new HttpException(
              { message, error: code, statusCode },
              statusCode,
            ));
          }

          // Handle timeout errors
          if (err.name === 'TimeoutError') {
            return throwError(() => new HttpException(
              { message: 'Service unavailable', error: 'SERVICE_TIMEOUT' },
              HttpStatus.SERVICE_UNAVAILABLE,
            ));
          }

          return throwError(() => err);
        }),
      ),
    );
  }
}
