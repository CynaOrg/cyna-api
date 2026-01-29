import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { CynaLoggerService } from '@cyna-api/common';
import { StockReservationService } from '../services';

@Injectable()
export class ReservationCleanupService {
  constructor(
    private readonly stockReservationService: StockReservationService,
    private readonly logger: CynaLoggerService,
  ) {
    this.logger.setContext('ReservationCleanupService');
  }

  /**
   * Clean up expired reservations every 5 minutes
   * This releases stock that was reserved but never confirmed (abandoned carts, failed payments, etc.)
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleExpiredReservations(): Promise<void> {
    this.logger.log('Starting expired reservations cleanup...');

    try {
      const cleanedCount = await this.stockReservationService.cleanupExpiredReservations();

      if (cleanedCount > 0) {
        this.logger.log(`Cleanup completed: ${cleanedCount} expired reservations released`);
      } else {
        this.logger.debug('Cleanup completed: no expired reservations found');
      }
    } catch (error) {
      this.logger.error(`Failed to cleanup expired reservations: ${error.message}`, error.stack);
    }
  }
}
