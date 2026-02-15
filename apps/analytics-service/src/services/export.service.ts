import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { firstValueFrom, timeout, retry, catchError, TimeoutError } from 'rxjs';
import { CynaLoggerService, SERVICE_NAMES, MESSAGE_PATTERNS } from '@cyna-api/common';

interface ExportResult {
  data: string;
  contentType: string;
  filename: string;
}

@Injectable()
export class ExportService {
  constructor(
    @Inject(SERVICE_NAMES.ORDER) private readonly orderClient: ClientProxy,
    @Inject(SERVICE_NAMES.PAYMENT) private readonly paymentClient: ClientProxy,
    private readonly logger: CynaLoggerService,
  ) {}

  async exportSales(dateFrom: string, dateTo: string, format: string): Promise<ExportResult> {
    const orders = await this.fetchOrdersInRange(dateFrom, dateTo);

    const paidStatuses = ['paid', 'completed', 'shipped', 'delivered'];
    const paidOrders = orders.filter((o: any) => paidStatuses.includes(o.status));

    const headers = ['Date', 'Order ID', 'Customer', 'Amount', 'Currency', 'Status'];
    const rows = paidOrders.map((order: any) => [
      new Date(order.createdAt).toISOString().slice(0, 10),
      order.id || order.orderNumber || '',
      order.customerEmail || order.userId || '',
      (parseFloat(order.totalAmount) || 0).toFixed(2),
      'EUR',
      order.status,
    ]);

    const csv = [headers.join(','), ...rows.map((r: string[]) => r.join(','))].join('\n');

    const fromDate = dateFrom.slice(0, 7);
    const toDate = dateTo.slice(0, 7);
    const filename =
      fromDate === toDate ? `sales_${fromDate}.csv` : `sales_${fromDate}_to_${toDate}.csv`;

    this.logger.log(`Sales export generated: ${filename} (${paidOrders.length} records)`);

    return {
      data: csv,
      contentType: 'text/csv',
      filename,
    };
  }

  async exportOrders(dateFrom: string, dateTo: string, format: string): Promise<ExportResult> {
    const orders = await this.fetchOrdersInRange(dateFrom, dateTo);

    const headers = [
      'Date',
      'Order ID',
      'Customer',
      'Items Count',
      'Subtotal',
      'Tax',
      'Total',
      'Currency',
      'Status',
      'Payment Status',
    ];

    const rows = orders.map((order: any) => {
      const items = order.items || [];
      return [
        new Date(order.createdAt).toISOString().slice(0, 10),
        order.id || order.orderNumber || '',
        order.customerEmail || order.userId || '',
        items.length.toString(),
        (parseFloat(order.subtotal) || 0).toFixed(2),
        (parseFloat(order.taxAmount) || 0).toFixed(2),
        (parseFloat(order.totalAmount) || 0).toFixed(2),
        'EUR',
        order.status || '',
        order.paymentStatus || '',
      ];
    });

    const csv = [headers.join(','), ...rows.map((r: string[]) => r.join(','))].join('\n');

    const fromDate = dateFrom.slice(0, 7);
    const toDate = dateTo.slice(0, 7);
    const filename =
      fromDate === toDate ? `orders_${fromDate}.csv` : `orders_${fromDate}_to_${toDate}.csv`;

    this.logger.log(`Orders export generated: ${filename} (${orders.length} records)`);

    return {
      data: csv,
      contentType: 'text/csv',
      filename,
    };
  }

  async exportSubscriptions(
    dateFrom: string,
    dateTo: string,
    format: string,
  ): Promise<ExportResult> {
    const subscriptions = await this.fetchSubscriptionsInRange(dateFrom, dateTo);

    const headers = [
      'Created Date',
      'Subscription ID',
      'Customer',
      'Product',
      'Amount',
      'Currency',
      'Billing Period',
      'Status',
    ];

    const rows = subscriptions.map((sub: any) => [
      new Date(sub.createdAt).toISOString().slice(0, 10),
      sub.id || sub.subscriptionId || '',
      sub.customerEmail || sub.userId || '',
      sub.productName || sub.planName || '',
      (parseFloat(sub.amount) || 0).toFixed(2),
      'EUR',
      sub.billingPeriod || 'monthly',
      sub.status || '',
    ]);

    const csv = [headers.join(','), ...rows.map((r: string[]) => r.join(','))].join('\n');

    const fromDate = dateFrom.slice(0, 7);
    const toDate = dateTo.slice(0, 7);
    const filename =
      fromDate === toDate
        ? `subscriptions_${fromDate}.csv`
        : `subscriptions_${fromDate}_to_${toDate}.csv`;

    this.logger.log(
      `Subscriptions export generated: ${filename} (${subscriptions.length} records)`,
    );

    return {
      data: csv,
      contentType: 'text/csv',
      filename,
    };
  }

  // ==================== Private helpers ====================

  private async fetchOrdersInRange(dateFrom: string, dateTo: string): Promise<any[]> {
    try {
      const result = await this.sendMessage<any>(
        this.orderClient,
        MESSAGE_PATTERNS.ORDER.ADMIN_GET_ORDERS,
        {},
      );

      const orders = Array.isArray(result) ? result : (result as any)?.data || [];
      const from = new Date(dateFrom);
      const to = new Date(dateTo);
      to.setUTCHours(23, 59, 59, 999);

      return orders.filter((o: any) => {
        const orderDate = new Date(o.createdAt);
        return orderDate >= from && orderDate <= to;
      });
    } catch {
      this.logger.warn('Failed to fetch orders for export');
      return [];
    }
  }

  private async fetchSubscriptionsInRange(dateFrom: string, dateTo: string): Promise<any[]> {
    try {
      const result = await this.sendMessage<any>(
        this.paymentClient,
        MESSAGE_PATTERNS.PAYMENT.GET_SUBSCRIPTIONS,
        { adminMode: true },
      );

      const subscriptions = Array.isArray(result) ? result : [];
      const from = new Date(dateFrom);
      const to = new Date(dateTo);
      to.setUTCHours(23, 59, 59, 999);

      return subscriptions.filter((s: any) => {
        const subDate = new Date(s.createdAt);
        return subDate >= from && subDate <= to;
      });
    } catch {
      this.logger.warn('Failed to fetch subscriptions for export');
      return [];
    }
  }

  private async sendMessage<T>(
    client: ClientProxy,
    pattern: Record<string, string>,
    data: any,
  ): Promise<T> {
    return firstValueFrom(
      client.send<T>(pattern, data).pipe(
        timeout(10000),
        retry({ count: 1, delay: 1000 }),
        catchError((err) => {
          if (err instanceof TimeoutError) {
            this.logger.warn(`Service timeout for pattern: ${JSON.stringify(pattern)}`);
            throw new RpcException({
              statusCode: 503,
              message: 'Service is not responding',
              code: 'SERVICE_TIMEOUT',
            });
          }
          throw err;
        }),
      ),
    );
  }
}
