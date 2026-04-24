import { Injectable, Inject, HttpException, HttpStatus } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { firstValueFrom, timeout, catchError, throwError } from 'rxjs';
import { SERVICE_NAMES, MESSAGE_PATTERNS } from '@cyna-api/common';
import { AnalyticsQueryDto, ExportQueryDto } from './dto';

@Injectable()
export class AnalyticsService {
  private readonly TIMEOUT = 15000; // 15s for analytics (heavier queries)

  constructor(
    @Inject(SERVICE_NAMES.ANALYTICS)
    private readonly analyticsClient: ClientProxy,
  ) {}

  // ==================== Dashboard ====================

  async getDashboard(query: AnalyticsQueryDto) {
    return this.sendMessage(MESSAGE_PATTERNS.ANALYTICS.GET_DASHBOARD, query);
  }

  // ==================== Sales ====================

  async getSales(query: AnalyticsQueryDto) {
    return this.sendMessage(MESSAGE_PATTERNS.ANALYTICS.GET_SALES, query);
  }

  async getSalesByCategory(query: AnalyticsQueryDto) {
    return this.sendMessage(MESSAGE_PATTERNS.ANALYTICS.GET_SALES_BY_CATEGORY, query);
  }

  async getSalesByProductType(query: AnalyticsQueryDto) {
    return this.sendMessage(MESSAGE_PATTERNS.ANALYTICS.GET_SALES_BY_PRODUCT_TYPE, query);
  }

  async getAverageCart(query: AnalyticsQueryDto) {
    return this.sendMessage(MESSAGE_PATTERNS.ANALYTICS.GET_AVERAGE_CART, query);
  }

  async getAverageCartByProductType(query: AnalyticsQueryDto) {
    return this.sendMessage(MESSAGE_PATTERNS.ANALYTICS.GET_AVERAGE_CART_BY_PRODUCT_TYPE, query);
  }

  // ==================== MRR ====================

  async getMrr(query: AnalyticsQueryDto) {
    return this.sendMessage(MESSAGE_PATTERNS.ANALYTICS.GET_MRR, query);
  }

  // ==================== Stock ====================

  async getStockStatus() {
    return this.sendMessage(MESSAGE_PATTERNS.ANALYTICS.GET_STOCK_STATUS, {});
  }

  // ==================== Exports ====================

  async exportSales(query: ExportQueryDto) {
    return this.sendMessage(MESSAGE_PATTERNS.ANALYTICS.EXPORT_SALES, query);
  }

  async exportOrders(query: ExportQueryDto) {
    return this.sendMessage(MESSAGE_PATTERNS.ANALYTICS.EXPORT_ORDERS, query);
  }

  async exportSubscriptions(query: ExportQueryDto) {
    return this.sendMessage(MESSAGE_PATTERNS.ANALYTICS.EXPORT_SUBSCRIPTIONS, query);
  }

  // ==================== Private Helper ====================

  private async sendMessage<T>(pattern: { cmd: string }, data: T) {
    return firstValueFrom(
      this.analyticsClient.send(pattern, data).pipe(
        timeout(this.TIMEOUT),
        catchError((err) => {
          if (err && typeof err === 'object' && 'statusCode' in err) {
            const statusCode = err.statusCode || HttpStatus.INTERNAL_SERVER_ERROR;
            const message = err.message || 'An error occurred';
            const code = err.code || 'UNKNOWN_ERROR';

            return throwError(
              () => new HttpException({ message, error: code, statusCode }, statusCode),
            );
          }

          if (err.name === 'TimeoutError') {
            return throwError(
              () =>
                new HttpException(
                  { message: 'Analytics service unavailable', error: 'SERVICE_TIMEOUT' },
                  HttpStatus.SERVICE_UNAVAILABLE,
                ),
            );
          }

          return throwError(() => err);
        }),
      ),
    );
  }
}
