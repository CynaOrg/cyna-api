import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, LessThan, MoreThan } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { firstValueFrom, throwError } from 'rxjs';
import { timeout, retry, catchError } from 'rxjs/operators';
import {
  CynaLoggerService,
  Language,
  SERVICE_NAMES,
  MESSAGE_PATTERNS,
  UserCredentialsView,
  UserProfileView,
} from '@cyna-api/common';
import { EmailVerificationToken } from '../entities/email-verification-token.entity';
import { PasswordResetToken } from '../entities/password-reset-token.entity';
import { RefreshToken } from '../entities/refresh-token.entity';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { AuthEventsPublisher } from '../events/auth-events.publisher';
import { CreateUserDto } from '../dto/create-user.dto';
import { LoginUserDto } from '../dto/login-user.dto';
import { AuthResponseDto, UserResponseDto } from '../dto/responses';

@Injectable()
export class AuthService {
  private readonly emailVerificationExpiryHours: number;
  private readonly passwordResetExpiryHours: number;

  constructor(
    @InjectRepository(EmailVerificationToken)
    private readonly emailVerificationTokenRepository: Repository<EmailVerificationToken>,
    @InjectRepository(PasswordResetToken)
    private readonly passwordResetTokenRepository: Repository<PasswordResetToken>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    @Inject(SERVICE_NAMES.USER)
    private readonly userClient: ClientProxy,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly authEventsPublisher: AuthEventsPublisher,
    private readonly configService: ConfigService,
    private readonly logger: CynaLoggerService,
  ) {
    this.emailVerificationExpiryHours = this.configService.get<number>(
      'auth.tokens.emailVerificationExpiryHours',
      24,
    );
    this.passwordResetExpiryHours = this.configService.get<number>(
      'auth.tokens.passwordResetExpiryHours',
      1,
    );
  }

  /**
   * Send a request/response message to USER_SERVICE with timeout, retry, and
   * RpcException translation. When user-service raises a structured RpcException
   * (e.g. 404 USER_NOT_FOUND), we re-emit the same RpcException so callers see
   * the original status code. Any other error becomes a 503.
   */
  private async callUserService<TResult, TPayload = unknown>(
    pattern: { cmd: string },
    payload: TPayload,
  ): Promise<TResult> {
    return firstValueFrom(
      this.userClient.send<TResult, TPayload>(pattern, payload).pipe(
        timeout(5000),
        retry({ count: 2, delay: 1000 }),
        catchError((err) => {
          if (err && typeof err === 'object' && 'statusCode' in err) {
            return throwError(() => new RpcException(err as Record<string, unknown>));
          }
          return throwError(
            () =>
              new RpcException({
                statusCode: 503,
                message: 'errors.auth.userServiceUnavailable',
                code: 'USER_SERVICE_UNAVAILABLE',
              }),
          );
        }),
      ),
    );
  }

  async register(dto: CreateUserDto): Promise<{ message: string; user: UserResponseDto }> {
    // Hash password first; user-service CreateUserDto requires a pre-computed hash.
    const passwordHash = await this.passwordService.hash(dto.password);

    const user = await this.callUserService<UserProfileView>(MESSAGE_PATTERNS.USER.CREATE, {
      email: dto.email,
      passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
      companyName: dto.companyName,
      vatNumber: dto.vatNumber,
      preferredLanguage: dto.preferredLanguage || Language.FR,
    });

    const verificationToken = this.tokenService.generateSecureToken();
    const hashedToken = this.tokenService.hashToken(verificationToken);
    const expiresAt = new Date(Date.now() + this.emailVerificationExpiryHours * 60 * 60 * 1000);

    const emailVerificationToken = this.emailVerificationTokenRepository.create({
      userId: user.id,
      token: hashedToken,
      expiresAt,
    });
    await this.emailVerificationTokenRepository.save(emailVerificationToken);

    await this.authEventsPublisher.emitUserRegistered({
      userId: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      verificationToken,
      language: user.preferredLanguage,
    });

    this.logger.log(`User registered: ${user.id}`, 'AuthService');

    return {
      message: 'common.messages.registrationSuccess',
      user: UserResponseDto.fromProfileView(user),
    };
  }

  async validateUser(dto: LoginUserDto): Promise<AuthResponseDto> {
    const user = await this.callUserService<UserCredentialsView | null>(
      MESSAGE_PATTERNS.USER.FIND_BY_EMAIL_FOR_LOGIN,
      { email: dto.email },
    );

    if (!user) {
      throw new RpcException({
        statusCode: 401,
        message: 'errors.auth.invalidCredentials',
        code: 'INVALID_CREDENTIALS',
      });
    }

    if (!user.isActive) {
      throw new RpcException({
        statusCode: 403,
        message: 'errors.auth.accountDisabled',
        code: 'ACCOUNT_DISABLED',
      });
    }

    const isPasswordValid = await this.passwordService.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new RpcException({
        statusCode: 401,
        message: 'errors.auth.invalidCredentials',
        code: 'INVALID_CREDENTIALS',
      });
    }

    if (!user.isVerified) {
      throw new RpcException({
        statusCode: 403,
        message: 'errors.auth.emailNotVerified',
        code: 'EMAIL_NOT_VERIFIED',
      });
    }

    const accessToken = this.tokenService.generateAccessToken({
      sub: user.id,
      email: user.email,
      type: 'user',
    });

    const refreshToken = await this.createRefreshToken(user.id, 'user');

    await this.authEventsPublisher.emitUserLogin(user.id);

    this.logger.log(`User logged in: ${user.id}`, 'AuthService');

    return {
      accessToken,
      refreshToken,
      expiresIn: this.tokenService.getAccessTokenExpirySeconds(),
      user: UserResponseDto.fromCredentialsView(user),
    };
  }

  async verifyEmail(token: string): Promise<{ success: boolean; message: string }> {
    const hashedToken = this.tokenService.hashToken(token);

    const emailVerificationToken = await this.emailVerificationTokenRepository.findOne({
      where: {
        token: hashedToken,
        verifiedAt: IsNull(),
      },
    });

    if (!emailVerificationToken) {
      throw new RpcException({
        statusCode: 400,
        message: 'errors.auth.verificationTokenInvalid',
        code: 'INVALID_TOKEN',
      });
    }

    if (emailVerificationToken.expiresAt < new Date()) {
      throw new RpcException({
        statusCode: 400,
        message: 'errors.auth.verificationTokenExpired',
        code: 'TOKEN_EXPIRED',
      });
    }

    const user = await this.callUserService<UserProfileView>(MESSAGE_PATTERNS.USER.GET_BY_ID, {
      userId: emailVerificationToken.userId,
    });

    await this.callUserService<void>(MESSAGE_PATTERNS.USER.MARK_VERIFIED, {
      userId: user.id,
    });

    emailVerificationToken.verifiedAt = new Date();
    await this.emailVerificationTokenRepository.save(emailVerificationToken);

    await this.authEventsPublisher.emitUserVerified(user.id, user.email, user.preferredLanguage);

    this.logger.log(`Email verified for user: ${user.id}`, 'AuthService');

    return {
      success: true,
      message: 'common.messages.emailVerified',
    };
  }

  async resendVerification(email: string): Promise<{ success: boolean; message: string }> {
    const user = await this.callUserService<UserProfileView | null>(
      MESSAGE_PATTERNS.USER.FIND_BY_EMAIL,
      { email },
    );

    // Anti-enumeration: always return success regardless of whether the user
    // exists or is already verified.
    if (!user || user.isVerified) {
      return {
        success: true,
        message: 'common.messages.verificationEmailSentSilent',
      };
    }

    await this.emailVerificationTokenRepository.delete({
      userId: user.id,
      verifiedAt: IsNull(),
    });

    const verificationToken = this.tokenService.generateSecureToken();
    const hashedToken = this.tokenService.hashToken(verificationToken);
    const expiresAt = new Date(Date.now() + this.emailVerificationExpiryHours * 60 * 60 * 1000);

    const emailVerificationToken = this.emailVerificationTokenRepository.create({
      userId: user.id,
      token: hashedToken,
      expiresAt,
    });
    await this.emailVerificationTokenRepository.save(emailVerificationToken);

    await this.authEventsPublisher.emitUserRegistered({
      userId: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      verificationToken,
      language: user.preferredLanguage,
    });

    this.logger.log(`Verification email resent for user: ${user.id}`, 'AuthService');

    return {
      success: true,
      message: 'common.messages.verificationEmailSentSilent',
    };
  }

  async forgotPassword(email: string): Promise<{ success: boolean; message: string }> {
    const user = await this.callUserService<UserProfileView | null>(
      MESSAGE_PATTERNS.USER.FIND_BY_EMAIL,
      { email },
    );

    // Anti-enumeration: silent success when the email is unknown.
    if (!user) {
      return {
        success: true,
        message: 'common.messages.passwordResetEmailSentSilent',
      };
    }

    await this.passwordResetTokenRepository.delete({
      userId: user.id,
      usedAt: IsNull(),
    });

    const resetToken = this.tokenService.generateSecureToken();
    const hashedToken = this.tokenService.hashToken(resetToken);
    const expiresAt = new Date(Date.now() + this.passwordResetExpiryHours * 60 * 60 * 1000);

    const passwordResetToken = this.passwordResetTokenRepository.create({
      userId: user.id,
      token: hashedToken,
      expiresAt,
    });
    await this.passwordResetTokenRepository.save(passwordResetToken);

    await this.authEventsPublisher.emitPasswordResetRequested({
      userId: user.id,
      email: user.email,
      firstName: user.firstName,
      resetToken,
      language: user.preferredLanguage,
    });

    this.logger.log(`Password reset requested for user: ${user.id}`, 'AuthService');

    return {
      success: true,
      message: 'common.messages.passwordResetEmailSentSilent',
    };
  }

  async resetPassword(
    token: string,
    newPassword: string,
  ): Promise<{ success: boolean; message: string }> {
    const hashedToken = this.tokenService.hashToken(token);

    const passwordResetToken = await this.passwordResetTokenRepository.findOne({
      where: {
        token: hashedToken,
        usedAt: IsNull(),
      },
    });

    if (!passwordResetToken) {
      throw new RpcException({
        statusCode: 400,
        message: 'errors.auth.resetTokenInvalid',
        code: 'INVALID_TOKEN',
      });
    }

    if (passwordResetToken.expiresAt < new Date()) {
      throw new RpcException({
        statusCode: 400,
        message: 'errors.auth.resetTokenExpired',
        code: 'TOKEN_EXPIRED',
      });
    }

    const user = await this.callUserService<UserProfileView>(MESSAGE_PATTERNS.USER.GET_BY_ID, {
      userId: passwordResetToken.userId,
    });

    const newPasswordHash = await this.passwordService.hash(newPassword);

    await this.callUserService<void>(MESSAGE_PATTERNS.USER.UPDATE_PASSWORD_HASH, {
      userId: user.id,
      passwordHash: newPasswordHash,
    });

    passwordResetToken.usedAt = new Date();
    await this.passwordResetTokenRepository.save(passwordResetToken);

    // Revoke all refresh tokens locally so every existing session is killed.
    await this.refreshTokenRepository.update(
      { userId: user.id, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );

    await this.authEventsPublisher.emitPasswordResetCompleted(
      user.id,
      user.email,
      user.preferredLanguage,
    );

    this.logger.log(`Password reset completed for user: ${user.id}`, 'AuthService');

    return {
      success: true,
      message: 'common.messages.passwordReset',
    };
  }

  private static readonly REFRESH_TOKEN_GRACE_PERIOD_MS = 30_000; // 30 seconds

  async refreshToken(refreshTokenValue: string): Promise<AuthResponseDto> {
    const hashedToken = this.tokenService.hashToken(refreshTokenValue);

    // First try to find an active (non-revoked) token
    let refreshToken = await this.refreshTokenRepository.findOne({
      where: {
        token: hashedToken,
        revokedAt: IsNull(),
      },
    });

    // If not found, check if it was recently revoked (grace period for rapid refreshes)
    if (!refreshToken) {
      const graceCutoff = new Date(Date.now() - AuthService.REFRESH_TOKEN_GRACE_PERIOD_MS);
      refreshToken = await this.refreshTokenRepository.findOne({
        where: {
          token: hashedToken,
          revokedAt: MoreThan(graceCutoff),
        },
      });

      if (refreshToken) {
        // Token was recently revoked (e.g. page refresh race condition).
        // Issue a fresh token pair so the session is not lost.
        if (!refreshToken.userId) {
          throw new RpcException({
            statusCode: 401,
            message: 'errors.auth.refreshTokenInvalid',
            code: 'INVALID_REFRESH_TOKEN',
          });
        }

        const user = await this.callUserService<UserProfileView>(MESSAGE_PATTERNS.USER.GET_BY_ID, {
          userId: refreshToken.userId,
        });

        if (!user.isActive) {
          throw new RpcException({
            statusCode: 403,
            message: 'errors.auth.accountDisabled',
            code: 'ACCOUNT_DISABLED',
          });
        }

        const accessToken = this.tokenService.generateAccessToken({
          sub: user.id,
          email: user.email,
          type: 'user',
        });

        const newRefreshToken = await this.createRefreshToken(user.id, 'user');

        this.logger.log(`Token refresh (grace period) for user: ${user.id}`, 'AuthService');

        return {
          accessToken,
          refreshToken: newRefreshToken,
          expiresIn: this.tokenService.getAccessTokenExpirySeconds(),
          user: UserResponseDto.fromProfileView(user),
        };
      }

      throw new RpcException({
        statusCode: 401,
        message: 'errors.auth.refreshTokenInvalid',
        code: 'INVALID_REFRESH_TOKEN',
      });
    }

    if (refreshToken.expiresAt < new Date()) {
      throw new RpcException({
        statusCode: 401,
        message: 'errors.auth.refreshTokenExpired',
        code: 'REFRESH_TOKEN_EXPIRED',
      });
    }

    if (!refreshToken.userId) {
      throw new RpcException({
        statusCode: 401,
        message: 'errors.auth.refreshTokenInvalid',
        code: 'INVALID_REFRESH_TOKEN',
      });
    }

    const user = await this.callUserService<UserProfileView>(MESSAGE_PATTERNS.USER.GET_BY_ID, {
      userId: refreshToken.userId,
    });

    if (!user.isActive) {
      throw new RpcException({
        statusCode: 403,
        message: 'errors.auth.accountDisabled',
        code: 'ACCOUNT_DISABLED',
      });
    }

    refreshToken.revokedAt = new Date();
    await this.refreshTokenRepository.save(refreshToken);

    const accessToken = this.tokenService.generateAccessToken({
      sub: user.id,
      email: user.email,
      type: 'user',
    });

    const newRefreshToken = await this.createRefreshToken(user.id, 'user');

    this.logger.log(`Token refreshed for user: ${user.id}`, 'AuthService');

    return {
      accessToken,
      refreshToken: newRefreshToken,
      expiresIn: this.tokenService.getAccessTokenExpirySeconds(),
      user: UserResponseDto.fromProfileView(user),
    };
  }

  async logout(userId: string, refreshTokenValue?: string): Promise<{ success: boolean }> {
    if (refreshTokenValue) {
      const hashedToken = this.tokenService.hashToken(refreshTokenValue);
      await this.refreshTokenRepository.update(
        { token: hashedToken, revokedAt: IsNull() },
        { revokedAt: new Date() },
      );
    }
    // If no refresh token provided (cookie lost), just acknowledge.
    // The current session is already dead without a valid token.
    // Do NOT revoke all sessions — other devices should stay logged in.

    this.logger.log(`User logged out: ${userId}`, 'AuthService');

    return { success: true };
  }

  /**
   * Revoke every non-expired refresh token for a user. Called when user-service
   * notifies us of a password change or account deletion so all sessions are
   * killed across devices.
   */
  async revokeAllUserRefreshTokens(userId: string): Promise<void> {
    await this.refreshTokenRepository.update(
      { userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
    this.logger.log(`All refresh tokens revoked for user: ${userId}`, 'AuthService');
  }

  private static readonly MAX_ACTIVE_SESSIONS = 5;

  private async createRefreshToken(entityId: string, type: 'user' | 'admin'): Promise<string> {
    const rawToken = this.tokenService.generateSecureToken();
    const hashedToken = this.tokenService.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + this.tokenService.getRefreshTokenExpiryMs());

    const entityField = type === 'user' ? 'userId' : 'adminId';

    // Enforce max active sessions: revoke oldest tokens beyond the limit
    const activeTokens = await this.refreshTokenRepository.find({
      where: { [entityField]: entityId, revokedAt: IsNull() },
      order: { createdAt: 'ASC' },
    });

    if (activeTokens.length >= AuthService.MAX_ACTIVE_SESSIONS) {
      const tokensToRevoke = activeTokens.slice(
        0,
        activeTokens.length - AuthService.MAX_ACTIVE_SESSIONS + 1,
      );
      await this.refreshTokenRepository.update(
        tokensToRevoke.map((t) => t.id),
        { revokedAt: new Date() },
      );
    }

    const refreshToken = this.refreshTokenRepository.create({
      [entityField]: entityId,
      token: hashedToken,
      expiresAt,
    });

    await this.refreshTokenRepository.save(refreshToken);

    return rawToken;
  }

  async cleanupExpiredTokens(): Promise<{
    verificationTokens: number;
    resetTokens: number;
    refreshTokens: number;
  }> {
    const now = new Date();

    const verificationResult = await this.emailVerificationTokenRepository.delete({
      expiresAt: LessThan(now),
      verifiedAt: IsNull(),
    });

    const resetResult = await this.passwordResetTokenRepository.delete({
      expiresAt: LessThan(now),
      usedAt: IsNull(),
    });

    const refreshResult = await this.refreshTokenRepository.delete({
      expiresAt: LessThan(now),
    });

    return {
      verificationTokens: verificationResult.affected || 0,
      resetTokens: resetResult.affected || 0,
      refreshTokens: refreshResult.affected || 0,
    };
  }
}
