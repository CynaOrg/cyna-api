import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CynaLoggerService } from '@cyna-api/common';
import { CartService } from '../services/cart.service';

@Injectable()
export class GuestCartCleanupCron {
  constructor(
    private readonly cartService: CartService,
    private readonly logger: CynaLoggerService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async cleanupExpiredGuestCarts(): Promise<void> {
    try {
      const deletedCount = await this.cartService.cleanupExpiredGuestCarts();
      if (deletedCount > 0) {
        this.logger.log(`Cleaned up ${deletedCount} expired guest carts`, 'GuestCartCleanupCron');
      }
    } catch (error) {
      this.logger.error(
        `Failed to cleanup expired guest carts: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error.stack : undefined,
        'GuestCartCleanupCron',
      );
    }
  }
}
