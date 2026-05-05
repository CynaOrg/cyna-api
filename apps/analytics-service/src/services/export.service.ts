import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { firstValueFrom, timeout, retry, catchError, TimeoutError } from 'rxjs';
import {
  CynaLoggerService,
  SERVICE_NAMES,
  MESSAGE_PATTERNS,
  buildCsvRow,
} from '@cyna-api/common';

export interface ExportResult {
  data: string;
  contentType: string;
  filename: string;
}

interface OrderRecord {
  createdAt: string | Date;
  id?: string;
  orderNumber?: string;
  customerEmail?: string;
  userId?: string;
  total?: string | number;
  subtotal?: string | number;
  taxAmount?: string | number;
  status?: string;
  paymentStatus?: string;
  items?: unknown[];
}

interface SubscriptionRecord {
  createdAt: string | Date;
  id?: string;
  subscriptionId?: string;
  customerEmail?: string;
  userId?: string;
  productName?: string;
  planName?: string;
  price?: string | number;
  billingPeriod?: string;
  status?: string;
}

@Injectable()
export class ExportService {
  constructor(
    @Inject(SERVICE_NAMES.ORDER) private readonly orderClient: ClientProxy,
    @Inject(SERVICE_NAMES.PAYMENT) private readonly paymentClient: ClientProxy,
    private readonly logger: CynaLoggerService,
  ) {}

  async exportSales(dateFrom: string, dateTo: string, _format: string): Promise<ExportResult> {
    const orders = await this.fetchOrdersInRange(dateFrom, dateTo);

    const paidStatuses = ['paid', 'completed', 'shipped', 'delivered'];
    const paidOrders = orders.filter((o: OrderRecord) => paidStatuses.includes(o.status || ''));

    const headers = ['Date', 'Order ID', 'Customer', 'Amount', 'Currency', 'Status'];
    const rows: Array<Array<string | number | null | undefined>> = paidOrders.map(
      (order: OrderRecord) => [
        new Date(order.createdAt).toISOString().slice(0, 10),
        order.id || order.orderNumber || '',
        order.customerEmail || order.userId || '',
        (parseFloat(String(order.total)) || 0).toFixed(2),
        'EUR',
        order.status || '',
      ],
    );

    const csv = [buildCsvRow(headers), ...rows.map((r) => buildCsvRow(r))].join('\n');

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

  async exportOrders(dateFrom: string, dateTo: string, _format: string): Promise<ExportResult> {
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

    const rows: Array<Array<string | number | null | undefined>> = orders.map(
      (order: OrderRecord) => {
        const items = order.items || [];
        return [
          new Date(order.createdAt).toISOString().slice(0, 10),
          order.id || order.orderNumber || '',
          order.customerEmail || order.userId || '',
          items.length.toString(),
          (parseFloat(String(order.subtotal)) || 0).toFixed(2),
          (parseFloat(String(order.taxAmount)) || 0).toFixed(2),
          (parseFloat(String(order.total)) || 0).toFixed(2),
          'EUR',
          order.status || '',
          order.paymentStatus || '',
        ];
      },
    );

    const csv = [buildCsvRow(headers), ...rows.map((r) => buildCsvRow(r))].join('\n');

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
    _format: string,
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

    const rows: Array<Array<string | number | null | undefined>> = subscriptions.map(
      (sub: SubscriptionRecord) => [
        new Date(sub.createdAt).toISOString().slice(0, 10),
        sub.id || sub.subscriptionId || '',
        sub.customerEmail || sub.userId || '',
        sub.productName || sub.planName || '',
        (parseFloat(String(sub.price)) || 0).toFixed(2),
        'EUR',
        sub.billingPeriod || 'monthly',
        sub.status || '',
      ],
    );

    const csv = [buildCsvRow(headers), ...rows.map((r) => buildCsvRow(r))].join('\n');

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

  private async fetchOrdersInRange(dateFrom: string, dateTo: string): Promise<OrderRecord[]> {
    try {
      const result = await this.sendMessage<OrderRecord[] | { data: OrderRecord[] }>(
        this.orderClient,
        MESSAGE_PATTERNS.ORDER.ADMIN_GET_ORDERS,
        { page: 1, limit: 10000 },
      );

      const orders = Array.isArray(result)
        ? result
        : (result as { data: OrderRecord[] })?.data || [];
      const from = new Date(dateFrom);
      const to = new Date(dateTo);
      to.setUTCHours(23, 59, 59, 999);

      return orders.filter((o: OrderRecord) => {
        const orderDate = new Date(o.createdAt);
        return orderDate >= from && orderDate <= to;
      });
    } catch {
      this.logger.warn('Failed to fetch orders for export');
      return [];
    }
  }

  private async fetchSubscriptionsInRange(
    dateFrom: string,
    dateTo: string,
  ): Promise<SubscriptionRecord[]> {
    try {
      const result = await this.sendMessage<SubscriptionRecord[]>(
        this.paymentClient,
        MESSAGE_PATTERNS.PAYMENT.GET_SUBSCRIPTIONS,
        { adminMode: true },
      );

      const subscriptions = Array.isArray(result) ? result : [];
      const from = new Date(dateFrom);
      const to = new Date(dateTo);
      to.setUTCHours(23, 59, 59, 999);

      return subscriptions.filter((s: SubscriptionRecord) => {
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
    data: unknown,
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
