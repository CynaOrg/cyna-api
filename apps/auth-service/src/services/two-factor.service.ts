import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, IsNull } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Admin2FACode } from '../entities/admin-2fa-code.entity';

@Injectable()
export class TwoFactorService {
  private readonly codeExpiryMinutes: number;

  constructor(
    @InjectRepository(Admin2FACode)
    private readonly admin2FACodeRepository: Repository<Admin2FACode>,
    private readonly configService: ConfigService,
  ) {
    this.codeExpiryMinutes = this.configService.get<number>('auth.twoFactor.codeExpiryMinutes', 5);
  }

  generateCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  async createCode(adminId: string): Promise<{ code: string; expiresAt: Date }> {
    await this.invalidatePreviousCodes(adminId);

    const code = this.generateCode();
    const expiresAt = new Date(Date.now() + this.codeExpiryMinutes * 60 * 1000);

    const twoFactorCode = this.admin2FACodeRepository.create({
      adminId,
      code,
      expiresAt,
    });

    await this.admin2FACodeRepository.save(twoFactorCode);

    return { code, expiresAt };
  }

  async validateCode(adminId: string, code: string): Promise<boolean> {
    const twoFactorCode = await this.admin2FACodeRepository.findOne({
      where: {
        adminId,
        code,
        usedAt: IsNull(),
      },
    });

    if (!twoFactorCode) {
      return false;
    }

    if (twoFactorCode.expiresAt < new Date()) {
      return false;
    }

    twoFactorCode.usedAt = new Date();
    await this.admin2FACodeRepository.save(twoFactorCode);

    return true;
  }

  async invalidatePreviousCodes(adminId: string): Promise<void> {
    await this.admin2FACodeRepository.delete({
      adminId,
      usedAt: IsNull(),
    });
  }

  async cleanupExpiredCodes(): Promise<number> {
    const result = await this.admin2FACodeRepository.delete({
      expiresAt: LessThan(new Date()),
      usedAt: IsNull(),
    });
    return result.affected || 0;
  }

  getCodeExpiryMinutes(): number {
    return this.codeExpiryMinutes;
  }
}
