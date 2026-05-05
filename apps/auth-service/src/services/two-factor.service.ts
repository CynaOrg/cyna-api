import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, IsNull } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { randomInt } from 'crypto';
import { Admin2FACode } from '../entities/admin-2fa-code.entity';

const MAX_2FA_ATTEMPTS = 5;

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
    return randomInt(100000, 1000000).toString();
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
        usedAt: IsNull(),
      },
    });

    if (!twoFactorCode) {
      return false;
    }

    if (twoFactorCode.expiresAt < new Date()) {
      return false;
    }

    if (twoFactorCode.code !== code) {
      // Increment attempts on failed validation; lock out after MAX_2FA_ATTEMPTS.
      // We mark the code as used (rather than deleting) so repository state stays
      // consistent and attackers cannot distinguish "wrong code" from "locked out".
      twoFactorCode.attempts = (twoFactorCode.attempts ?? 0) + 1;
      if (twoFactorCode.attempts >= MAX_2FA_ATTEMPTS) {
        twoFactorCode.usedAt = new Date();
      }
      await this.admin2FACodeRepository.save(twoFactorCode);
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
