import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CynaLoggerService } from '@cyna-api/common';
import { AuthService } from '../services/auth.service';
import { TwoFactorService } from '../services/two-factor.service';

@Injectable()
export class CleanupService {
  constructor(
    private readonly authService: AuthService,
    private readonly twoFactorService: TwoFactorService,
    private readonly logger: CynaLoggerService,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async cleanup2FACodes(): Promise<void> {
    try {
      const deletedCount = await this.twoFactorService.cleanupExpiredCodes();
      if (deletedCount > 0) {
        this.logger.log(`Cleaned up ${deletedCount} expired 2FA codes`, 'CleanupService');
      }
    } catch (error) {
      this.logger.error(
        `Failed to cleanup 2FA codes: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error.stack : undefined,
        'CleanupService',
      );
    }
  }

  @Cron(CronExpression.EVERY_HOUR)
  async cleanupExpiredTokens(): Promise<void> {
    try {
      const result = await this.authService.cleanupExpiredTokens();
      const totalDeleted = result.verificationTokens + result.resetTokens + result.refreshTokens;

      if (totalDeleted > 0) {
        this.logger.log(
          `Cleaned up expired tokens: ${result.verificationTokens} verification, ${result.resetTokens} reset, ${result.refreshTokens} refresh`,
          'CleanupService',
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to cleanup expired tokens: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error.stack : undefined,
        'CleanupService',
      );
    }
  }
}
