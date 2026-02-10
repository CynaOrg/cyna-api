import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull, LessThan, MoreThan, Not } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { RpcException } from '@nestjs/microservices';
import { CynaLoggerService, Language } from '@cyna-api/common';
import { User } from '../entities/user.entity';
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
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(EmailVerificationToken)
    private readonly emailVerificationTokenRepository: Repository<EmailVerificationToken>,
    @InjectRepository(PasswordResetToken)
    private readonly passwordResetTokenRepository: Repository<PasswordResetToken>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
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

  async register(dto: CreateUserDto): Promise<AuthResponseDto> {
    const existingUser = await this.userRepository.findOne({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new RpcException({
        statusCode: 409,
        message: 'Email already registered',
        code: 'EMAIL_EXISTS',
      });
    }

    const passwordHash = await this.passwordService.hash(dto.password);

    const user = this.userRepository.create({
      email: dto.email,
      passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
      companyName: dto.companyName,
      vatNumber: dto.vatNumber,
      preferredLanguage: dto.preferredLanguage || Language.FR,
      isVerified: false,
      isActive: true,
    });

    await this.userRepository.save(user);

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

    const accessToken = this.tokenService.generateAccessToken({
      sub: user.id,
      email: user.email,
      type: 'user',
    });

    const refreshToken = await this.createRefreshToken(user.id, 'user');

    this.logger.log(`User registered: ${user.email}`, 'AuthService');

    return {
      accessToken,
      refreshToken,
      expiresIn: this.tokenService.getAccessTokenExpirySeconds(),
      user: UserResponseDto.fromEntity(user),
    };
  }

  async validateUser(dto: LoginUserDto): Promise<AuthResponseDto> {
    const user = await this.userRepository.findOne({
      where: { email: dto.email },
    });

    if (!user) {
      throw new RpcException({
        statusCode: 401,
        message: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS',
      });
    }

    if (!user.isActive) {
      throw new RpcException({
        statusCode: 403,
        message: 'Account is disabled',
        code: 'ACCOUNT_DISABLED',
      });
    }

    const isPasswordValid = await this.passwordService.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new RpcException({
        statusCode: 401,
        message: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS',
      });
    }

    if (!user.isVerified) {
      throw new RpcException({
        statusCode: 403,
        message: 'Email not verified',
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

    this.logger.log(`User logged in: ${user.email}`, 'AuthService');

    return {
      accessToken,
      refreshToken,
      expiresIn: this.tokenService.getAccessTokenExpirySeconds(),
      user: UserResponseDto.fromEntity(user),
    };
  }

  async verifyEmail(token: string): Promise<{ success: boolean; message: string }> {
    const hashedToken = this.tokenService.hashToken(token);

    const emailVerificationToken = await this.emailVerificationTokenRepository.findOne({
      where: {
        token: hashedToken,
        verifiedAt: IsNull(),
      },
      relations: ['user'],
    });

    if (!emailVerificationToken) {
      throw new RpcException({
        statusCode: 400,
        message: 'Invalid or expired verification token',
        code: 'INVALID_TOKEN',
      });
    }

    if (emailVerificationToken.expiresAt < new Date()) {
      throw new RpcException({
        statusCode: 400,
        message: 'Verification token has expired',
        code: 'TOKEN_EXPIRED',
      });
    }

    const user = await this.userRepository.findOne({
      where: { id: emailVerificationToken.userId },
    });

    if (!user) {
      throw new RpcException({
        statusCode: 404,
        message: 'User not found',
        code: 'USER_NOT_FOUND',
      });
    }

    user.isVerified = true;
    await this.userRepository.save(user);

    emailVerificationToken.verifiedAt = new Date();
    await this.emailVerificationTokenRepository.save(emailVerificationToken);

    await this.authEventsPublisher.emitUserVerified(user.id);

    this.logger.log(`Email verified for user: ${user.email}`, 'AuthService');

    return {
      success: true,
      message: 'Email verified successfully',
    };
  }

  async resendVerification(email: string): Promise<{ success: boolean; message: string }> {
    const user = await this.userRepository.findOne({
      where: { email },
    });

    if (!user) {
      return {
        success: true,
        message: 'If the email exists, a verification email has been sent',
      };
    }

    if (user.isVerified) {
      return {
        success: true,
        message: 'If the email exists, a verification email has been sent',
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

    this.logger.log(`Verification email resent for user: ${user.email}`, 'AuthService');

    return {
      success: true,
      message: 'If the email exists, a verification email has been sent',
    };
  }

  async forgotPassword(email: string): Promise<{ success: boolean; message: string }> {
    const user = await this.userRepository.findOne({
      where: { email },
    });

    if (!user) {
      return {
        success: true,
        message: 'If the email exists, a password reset email has been sent',
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

    this.logger.log(`Password reset requested for user: ${user.email}`, 'AuthService');

    return {
      success: true,
      message: 'If the email exists, a password reset email has been sent',
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
        message: 'Invalid or expired reset token',
        code: 'INVALID_TOKEN',
      });
    }

    if (passwordResetToken.expiresAt < new Date()) {
      throw new RpcException({
        statusCode: 400,
        message: 'Reset token has expired',
        code: 'TOKEN_EXPIRED',
      });
    }

    const user = await this.userRepository.findOne({
      where: { id: passwordResetToken.userId },
    });

    if (!user) {
      throw new RpcException({
        statusCode: 404,
        message: 'User not found',
        code: 'USER_NOT_FOUND',
      });
    }

    user.passwordHash = await this.passwordService.hash(newPassword);
    await this.userRepository.save(user);

    passwordResetToken.usedAt = new Date();
    await this.passwordResetTokenRepository.save(passwordResetToken);

    await this.refreshTokenRepository.update(
      { userId: user.id, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );

    await this.authEventsPublisher.emitPasswordResetCompleted(user.id);

    this.logger.log(`Password reset completed for user: ${user.email}`, 'AuthService');

    return {
      success: true,
      message: 'Password reset successfully',
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
      relations: ['user'],
    });

    // If not found, check if it was recently revoked (grace period for rapid refreshes)
    if (!refreshToken) {
      const graceCutoff = new Date(Date.now() - AuthService.REFRESH_TOKEN_GRACE_PERIOD_MS);
      refreshToken = await this.refreshTokenRepository.findOne({
        where: {
          token: hashedToken,
          revokedAt: MoreThan(graceCutoff),
        },
        relations: ['user'],
      });

      if (refreshToken) {
        // Token was recently revoked (e.g. page refresh race condition).
        // Issue a fresh token pair so the session is not lost.
        const user = refreshToken.user;

        if (!user || !user.isActive) {
          throw new RpcException({
            statusCode: 401,
            message: 'Invalid refresh token',
            code: 'INVALID_REFRESH_TOKEN',
          });
        }

        const accessToken = this.tokenService.generateAccessToken({
          sub: user.id,
          email: user.email,
          type: 'user',
        });

        const newRefreshToken = await this.createRefreshToken(user.id, 'user');

        this.logger.log(`Token refresh (grace period) for user: ${user.email}`, 'AuthService');

        return {
          accessToken,
          refreshToken: newRefreshToken,
          expiresIn: this.tokenService.getAccessTokenExpirySeconds(),
          user: UserResponseDto.fromEntity(user),
        };
      }

      throw new RpcException({
        statusCode: 401,
        message: 'Invalid refresh token',
        code: 'INVALID_REFRESH_TOKEN',
      });
    }

    if (refreshToken.expiresAt < new Date()) {
      throw new RpcException({
        statusCode: 401,
        message: 'Refresh token has expired',
        code: 'REFRESH_TOKEN_EXPIRED',
      });
    }

    if (!refreshToken.user) {
      throw new RpcException({
        statusCode: 401,
        message: 'Invalid refresh token',
        code: 'INVALID_REFRESH_TOKEN',
      });
    }

    const user = refreshToken.user;

    if (!user.isActive) {
      throw new RpcException({
        statusCode: 403,
        message: 'Account is disabled',
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

    this.logger.log(`Token refreshed for user: ${user.email}`, 'AuthService');

    return {
      accessToken,
      refreshToken: newRefreshToken,
      expiresIn: this.tokenService.getAccessTokenExpirySeconds(),
      user: UserResponseDto.fromEntity(user),
    };
  }

  async logout(userId: string, refreshTokenValue?: string): Promise<{ success: boolean }> {
    if (refreshTokenValue) {
      const hashedToken = this.tokenService.hashToken(refreshTokenValue);
      await this.refreshTokenRepository.update(
        { token: hashedToken, revokedAt: IsNull() },
        { revokedAt: new Date() },
      );
    } else {
      await this.refreshTokenRepository.update(
        { userId, revokedAt: IsNull() },
        { revokedAt: new Date() },
      );
    }

    this.logger.log(`User logged out: ${userId}`, 'AuthService');

    return { success: true };
  }

  private async createRefreshToken(entityId: string, type: 'user' | 'admin'): Promise<string> {
    const rawToken = this.tokenService.generateSecureToken();
    const hashedToken = this.tokenService.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + this.tokenService.getRefreshTokenExpiryMs());

    const refreshToken = this.refreshTokenRepository.create({
      [type === 'user' ? 'userId' : 'adminId']: entityId,
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
