import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { RpcException } from '@nestjs/microservices';
import { CynaLoggerService, Language, AdminRole } from '@cyna-api/common';
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
    // passwordHash is select:false on the entity; opt in explicitly here.
    const admin = await this.adminRepository
      .createQueryBuilder('admin')
      .addSelect('admin.passwordHash')
      .where('admin.email = :email', { email: dto.email })
      .getOne();

    if (!admin) {
      throw new RpcException({
        statusCode: 401,
        message: 'errors.auth.invalidCredentials',
        code: 'INVALID_CREDENTIALS',
      });
    }

    if (!admin.isActive) {
      throw new RpcException({
        statusCode: 403,
        message: 'errors.auth.adminAccountDisabled',
        code: 'ACCOUNT_DISABLED',
      });
    }

    const isPasswordValid = await this.passwordService.compare(dto.password, admin.passwordHash);
    if (!isPasswordValid) {
      throw new RpcException({
        statusCode: 401,
        message: 'errors.auth.invalidCredentials',
        code: 'INVALID_CREDENTIALS',
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

    const tempToken = this.tokenService.generateTempToken({
      sub: admin.id,
      email: admin.email,
      purpose: '2fa',
    });

    this.logger.log(`2FA code sent to admin: ${admin.id}`, 'AdminAuthService');

    return {
      requires2FA: true,
      tempToken,
      message: 'common.messages.2faCodeSent',
    };
  }

  async verify2FA(dto: Verify2FADto): Promise<AdminAuthResponseDto> {
    let payload: { sub: string; email: string; purpose: string };

    try {
      payload = this.tokenService.verifyTempToken(dto.tempToken);
    } catch {
      throw new RpcException({
        statusCode: 401,
        message: 'errors.auth.tempTokenInvalid',
        code: 'INVALID_TEMP_TOKEN',
      });
    }

    if (payload.purpose !== '2fa') {
      throw new RpcException({
        statusCode: 401,
        message: 'errors.auth.tempTokenPurposeInvalid',
        code: 'INVALID_TOKEN_PURPOSE',
      });
    }

    const admin = await this.adminRepository.findOne({
      where: { id: payload.sub },
    });

    if (!admin) {
      throw new RpcException({
        statusCode: 404,
        message: 'errors.auth.adminNotFound',
        code: 'ADMIN_NOT_FOUND',
      });
    }

    if (!admin.isActive) {
      throw new RpcException({
        statusCode: 403,
        message: 'errors.auth.adminAccountDisabled',
        code: 'ACCOUNT_DISABLED',
      });
    }

    const isCodeValid = await this.twoFactorService.validateCode(admin.id, dto.code);
    if (!isCodeValid) {
      throw new RpcException({
        statusCode: 401,
        message: 'errors.auth.2faInvalid',
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

    const refreshToken = await this.createRefreshToken(admin.id);

    await this.authEventsPublisher.emitAdminLogin(admin.id);

    this.logger.log(`Admin logged in: ${admin.id}`, 'AdminAuthService');

    return {
      accessToken,
      refreshToken,
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
        message: 'errors.auth.tempTokenInvalid',
        code: 'INVALID_TEMP_TOKEN',
      });
    }

    if (payload.purpose !== '2fa') {
      throw new RpcException({
        statusCode: 401,
        message: 'errors.auth.tempTokenPurposeInvalid',
        code: 'INVALID_TOKEN_PURPOSE',
      });
    }

    const admin = await this.adminRepository.findOne({
      where: { id: payload.sub },
    });

    if (!admin) {
      throw new RpcException({
        statusCode: 404,
        message: 'errors.auth.adminNotFound',
        code: 'ADMIN_NOT_FOUND',
      });
    }

    if (!admin.isActive) {
      throw new RpcException({
        statusCode: 403,
        message: 'errors.auth.adminAccountDisabled',
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

    this.logger.log(`2FA code resent to admin: ${admin.id}`, 'AdminAuthService');

    return {
      requires2FA: true,
      tempToken: newTempToken,
      message: 'common.messages.2faCodeResent',
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

    const admin = refreshToken.admin;

    if (!admin.isActive) {
      throw new RpcException({
        statusCode: 403,
        message: 'errors.auth.adminAccountDisabled',
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

    const newRefreshToken = await this.createRefreshToken(admin.id);

    this.logger.log(`Token refreshed for admin: ${admin.id}`, 'AdminAuthService');

    return {
      accessToken,
      refreshToken: newRefreshToken,
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

  async getMe(adminId: string): Promise<AdminResponseDto> {
    const admin = await this.adminRepository.findOne({
      where: { id: adminId },
    });

    if (!admin) {
      throw new RpcException({
        statusCode: 404,
        message: 'errors.auth.adminNotFound',
        code: 'ADMIN_NOT_FOUND',
      });
    }

    if (!admin.isActive) {
      throw new RpcException({
        statusCode: 403,
        message: 'errors.auth.adminAccountDisabled',
        code: 'ACCOUNT_DISABLED',
      });
    }

    return AdminResponseDto.fromEntity(admin);
  }

  async getAdmins() {
    const admins = await this.adminRepository.find({
      select: [
        'id',
        'email',
        'firstName',
        'lastName',
        'role',
        'isActive',
        'lastLoginAt',
        'createdAt',
      ],
      order: { createdAt: 'DESC' },
    });

    return { data: admins };
  }

  async getAdmin(adminId: string) {
    const admin = await this.adminRepository.findOne({
      where: { id: adminId },
      select: [
        'id',
        'email',
        'firstName',
        'lastName',
        'role',
        'isActive',
        'lastLoginAt',
        'createdAt',
        'updatedAt',
      ],
    });

    if (!admin) {
      throw new RpcException({
        statusCode: 404,
        message: 'errors.auth.adminNotFound',
        code: 'ADMIN_NOT_FOUND',
      });
    }

    return admin;
  }

  async createAdmin(dto: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    role: AdminRole;
  }) {
    const existing = await this.adminRepository.findOne({
      where: { email: dto.email },
    });

    if (existing) {
      throw new RpcException({
        statusCode: 409,
        message: 'errors.auth.emailAlreadyTaken',
        code: 'EMAIL_ALREADY_EXISTS',
      });
    }

    const passwordHash = await this.passwordService.hash(dto.password);

    const admin = this.adminRepository.create({
      email: dto.email,
      passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
      role: dto.role,
      isActive: true,
    });

    const savedAdmin = await this.adminRepository.save(admin);

    this.logger.log(`Admin created: ${savedAdmin.id} (${savedAdmin.role})`, 'AdminAuthService');

    return {
      id: savedAdmin.id,
      email: savedAdmin.email,
      firstName: savedAdmin.firstName,
      lastName: savedAdmin.lastName,
      role: savedAdmin.role,
      isActive: savedAdmin.isActive,
      createdAt: savedAdmin.createdAt,
    };
  }

  async updateAdmin(
    adminId: string,
    dto: {
      firstName?: string;
      lastName?: string;
      role?: AdminRole;
      isActive?: boolean;
    },
    requestAdminId?: string,
  ) {
    // Mirror CANNOT_DELETE_SELF: deactivating yourself locks you out, which is
    // functionally equivalent to deleting your own account. Block it server-side
    // so a direct API call can't bypass the UI guards.
    if (requestAdminId !== undefined && requestAdminId === adminId && dto.isActive === false) {
      throw new RpcException({
        statusCode: 400,
        message: 'errors.auth.cannotDeactivateSelf',
        code: 'CANNOT_DEACTIVATE_SELF',
      });
    }

    const admin = await this.adminRepository.findOne({
      where: { id: adminId },
    });

    if (!admin) {
      throw new RpcException({
        statusCode: 404,
        message: 'errors.auth.adminNotFound',
        code: 'ADMIN_NOT_FOUND',
      });
    }

    if (dto.firstName !== undefined) admin.firstName = dto.firstName;
    if (dto.lastName !== undefined) admin.lastName = dto.lastName;
    if (dto.role !== undefined) admin.role = dto.role;
    if (dto.isActive !== undefined) admin.isActive = dto.isActive;

    const updatedAdmin = await this.adminRepository.save(admin);

    this.logger.log(`Admin updated: ${updatedAdmin.id}`, 'AdminAuthService');

    return {
      id: updatedAdmin.id,
      email: updatedAdmin.email,
      firstName: updatedAdmin.firstName,
      lastName: updatedAdmin.lastName,
      role: updatedAdmin.role,
      isActive: updatedAdmin.isActive,
      createdAt: updatedAdmin.createdAt,
      updatedAt: updatedAdmin.updatedAt,
    };
  }

  async deleteAdmin(adminId: string, requestAdminId: string) {
    if (adminId === requestAdminId) {
      throw new RpcException({
        statusCode: 400,
        message: 'errors.auth.cannotDeleteSelf',
        code: 'CANNOT_DELETE_SELF',
      });
    }

    const admin = await this.adminRepository.findOne({
      where: { id: adminId },
    });

    if (!admin) {
      throw new RpcException({
        statusCode: 404,
        message: 'errors.auth.adminNotFound',
        code: 'ADMIN_NOT_FOUND',
      });
    }

    await this.adminRepository.remove(admin);

    this.logger.log(`Admin deleted: ${admin.id} by admin ${requestAdminId}`, 'AdminAuthService');

    return { success: true, message: 'common.messages.adminAccountDeleted' };
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
