import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CynaLoggerService } from '@cyna-api/common';
import { StockService } from '../services/stock.service';

@Injectable()
export class StockCleanupCron {
  constructor(
    private readonly stockService: StockService,
    private readonly logger: CynaLoggerService,
  ) {}

  @Cron('* * * * *')
  async cleanupExpiredReservations(): Promise<void> {
    try {
      const deletedCount = await this.stockService.cleanupExpiredReservations();
      if (deletedCount > 0) {
        this.logger.log(
          `Cleaned up ${deletedCount} expired stock reservations`,
          'StockCleanupCron',
        );
      }
    } catch (error) {
      this.logger.error(
        `Failed to cleanup expired reservations: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error.stack : undefined,
        'StockCleanupCron',
      );
    }
  }
}
