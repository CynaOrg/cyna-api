import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { RpcException } from '@nestjs/microservices';
import { CynaLoggerService, Language } from '@cyna-api/common';
import { Admin } from '../entities/admin.entity';
import { RefreshToken } from '../entities/refresh-token.entity';
import { PasswordService } from './password.service';
import { TokenService } from './token.service';
import { TwoFactorService } from './two-factor.service';
import { AuthEventsPublisher } from '../events/auth-events.publisher';
import { AdminLoginDto } from '../dto/admin-login.dto';
import { Verify2FADto } from '../dto/verify-2fa.dto';
import { Admin2FAResponseDto, AdminAuthResponseDto, AdminResponseDto } from '../dto/responses';

@Injectable()
export class AdminAuthService {
  constructor(
    @InjectRepository(Admin)
    private readonly adminRepository: Repository<Admin>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    private readonly passwordService: PasswordService,
    private readonly tokenService: TokenService,
    private readonly twoFactorService: TwoFactorService,
    private readonly authEventsPublisher: AuthEventsPublisher,
    private readonly logger: CynaLoggerService,
  ) {}

  async adminLogin(dto: AdminLoginDto): Promise<Admin2FAResponseDto> {
    const admin = await this.adminRepository.findOne({
      where: { email: dto.email },
    });

    if (!admin) {
      throw new RpcException({
        statusCode: 401,
        message: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS',
      });
    }

    if (!admin.isActive) {
      throw new RpcException({
        statusCode: 403,
        message: 'Admin account is disabled',
        code: 'ACCOUNT_DISABLED',
      });
    }

    const isPasswordValid = await this.passwordService.compare(dto.password, admin.passwordHash);
    if (!isPasswordValid) {
      throw new RpcException({
        statusCode: 401,
        message: 'Invalid credentials',
        code: 'INVALID_CREDENTIALS',
      });
    }

    const { code, expiresAt } = await this.twoFactorService.createCode(admin.id);

    await this.authEventsPublisher.emitAdmin2FACodeRequested({
      adminId: admin.id,
      email: admin.email,
      firstName: admin.firstName,
      code,
      expiresInMinutes: this.twoFactorService.getCodeExpiryMinutes(),
      language: Language.FR,
    });

    const tempToken = this.tokenService.generateTempToken({
      sub: admin.id,
      email: admin.email,
      purpose: '2fa',
    });

    this.logger.log(`2FA code sent to admin: ${admin.email}`, 'AdminAuthService');

    return {
      requires2FA: true,
      tempToken,
      message: 'A verification code has been sent to your email',
    };
  }

  async verify2FA(dto: Verify2FADto): Promise<AdminAuthResponseDto> {
    let payload: { sub: string; email: string; purpose: string };

    try {
      payload = this.tokenService.verifyTempToken(dto.tempToken);
    } catch {
      throw new RpcException({
        statusCode: 401,
        message: 'Invalid or expired temporary token',
        code: 'INVALID_TEMP_TOKEN',
      });
    }

    if (payload.purpose !== '2fa') {
      throw new RpcException({
        statusCode: 401,
        message: 'Invalid token purpose',
        code: 'INVALID_TOKEN_PURPOSE',
      });
    }

    const admin = await this.adminRepository.findOne({
      where: { id: payload.sub },
    });

    if (!admin) {
      throw new RpcException({
        statusCode: 404,
        message: 'Admin not found',
        code: 'ADMIN_NOT_FOUND',
      });
    }

    if (!admin.isActive) {
      throw new RpcException({
        statusCode: 403,
        message: 'Admin account is disabled',
        code: 'ACCOUNT_DISABLED',
      });
    }

    const isCodeValid = await this.twoFactorService.validateCode(admin.id, dto.code);
    if (!isCodeValid) {
      throw new RpcException({
        statusCode: 401,
        message: 'Invalid or expired 2FA code',
        code: 'INVALID_2FA_CODE',
      });
    }

    admin.lastLoginAt = new Date();
    await this.adminRepository.save(admin);

    const accessToken = this.tokenService.generateAccessToken({
      sub: admin.id,
      email: admin.email,
      type: 'admin',
      role: admin.role,
    });

    await this.createRefreshToken(admin.id);

    await this.authEventsPublisher.emitAdminLogin(admin.id);

    this.logger.log(`Admin logged in: ${admin.email}`, 'AdminAuthService');

    return {
      accessToken,
      expiresIn: this.tokenService.getAccessTokenExpirySeconds(),
      admin: AdminResponseDto.fromEntity(admin),
    };
  }

  async resend2FA(tempToken: string): Promise<Admin2FAResponseDto> {
    let payload: { sub: string; email: string; purpose: string };

    try {
      payload = this.tokenService.verifyTempToken(tempToken);
    } catch {
      throw new RpcException({
        statusCode: 401,
        message: 'Invalid or expired temporary token',
        code: 'INVALID_TEMP_TOKEN',
      });
    }

    if (payload.purpose !== '2fa') {
      throw new RpcException({
        statusCode: 401,
        message: 'Invalid token purpose',
        code: 'INVALID_TOKEN_PURPOSE',
      });
    }

    const admin = await this.adminRepository.findOne({
      where: { id: payload.sub },
    });

    if (!admin) {
      throw new RpcException({
        statusCode: 404,
        message: 'Admin not found',
        code: 'ADMIN_NOT_FOUND',
      });
    }

    if (!admin.isActive) {
      throw new RpcException({
        statusCode: 403,
        message: 'Admin account is disabled',
        code: 'ACCOUNT_DISABLED',
      });
    }

    const { code } = await this.twoFactorService.createCode(admin.id);

    await this.authEventsPublisher.emitAdmin2FACodeRequested({
      adminId: admin.id,
      email: admin.email,
      firstName: admin.firstName,
      code,
      expiresInMinutes: this.twoFactorService.getCodeExpiryMinutes(),
      language: Language.FR,
    });

    const newTempToken = this.tokenService.generateTempToken({
      sub: admin.id,
      email: admin.email,
      purpose: '2fa',
    });

    this.logger.log(`2FA code resent to admin: ${admin.email}`, 'AdminAuthService');

    return {
      requires2FA: true,
      tempToken: newTempToken,
      message: 'A new verification code has been sent to your email',
    };
  }

  async refreshToken(refreshTokenValue: string): Promise<AdminAuthResponseDto> {
    const hashedToken = this.tokenService.hashToken(refreshTokenValue);

    const refreshToken = await this.refreshTokenRepository.findOne({
      where: {
        token: hashedToken,
        revokedAt: IsNull(),
      },
      relations: ['admin'],
    });

    if (!refreshToken || !refreshToken.admin) {
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

    const admin = refreshToken.admin;

    if (!admin.isActive) {
      throw new RpcException({
        statusCode: 403,
        message: 'Admin account is disabled',
        code: 'ACCOUNT_DISABLED',
      });
    }

    refreshToken.revokedAt = new Date();
    await this.refreshTokenRepository.save(refreshToken);

    const accessToken = this.tokenService.generateAccessToken({
      sub: admin.id,
      email: admin.email,
      type: 'admin',
      role: admin.role,
    });

    await this.createRefreshToken(admin.id);

    this.logger.log(`Token refreshed for admin: ${admin.email}`, 'AdminAuthService');

    return {
      accessToken,
      expiresIn: this.tokenService.getAccessTokenExpirySeconds(),
      admin: AdminResponseDto.fromEntity(admin),
    };
  }

  async logout(adminId: string, refreshTokenValue?: string): Promise<{ success: boolean }> {
    if (refreshTokenValue) {
      const hashedToken = this.tokenService.hashToken(refreshTokenValue);
      await this.refreshTokenRepository.update(
        { token: hashedToken, revokedAt: IsNull() },
        { revokedAt: new Date() },
      );
    } else {
      await this.refreshTokenRepository.update(
        { adminId, revokedAt: IsNull() },
        { revokedAt: new Date() },
      );
    }

    this.logger.log(`Admin logged out: ${adminId}`, 'AdminAuthService');

    return { success: true };
  }

  private async createRefreshToken(adminId: string): Promise<string> {
    const rawToken = this.tokenService.generateSecureToken();
    const hashedToken = this.tokenService.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + this.tokenService.getRefreshTokenExpiryMs());

    const refreshToken = this.refreshTokenRepository.create({
      adminId,
      token: hashedToken,
      expiresAt,
    });

    await this.refreshTokenRepository.save(refreshToken);

    return rawToken;
  }
}
