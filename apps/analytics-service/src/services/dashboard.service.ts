import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { firstValueFrom, timeout, retry, catchError, TimeoutError } from 'rxjs';
import { CynaLoggerService, SERVICE_NAMES, MESSAGE_PATTERNS } from '@cyna-api/common';
import { ConfigService } from '@nestjs/config';
import { AnalyticsCache } from '../entities';
import { DashboardPeriod } from '../dto';

interface OrderRecord {
  createdAt: string | Date;
  status: string;
  total: string | number;
  orderType?: string;
}

interface SubscriptionRecord {
  status: string;
  createdAt: string | Date;
  cancelledAt?: string | Date | null;
  updatedAt?: string | Date;
  price: string | number;
  billingPeriod?: string;
}

interface DateRange {
  start: Date;
  end: Date;
  prevStart: Date;
  prevEnd: Date;
}

export interface DashboardResult {
  revenue: {
    total: number;
    recurring: number;
    oneTime: number;
    currency: string;
    changePercent: number;
  };
  orders: {
    total: number;
    completed: number;
    pending: number;
    cancelled: number;
    changePercent: number;
  };
  subscriptions: {
    active: number;
    new: number;
    churned: number;
    mrr: number;
    changePercent: number;
  };
  averageOrderValue: number;
  conversionRate: number;
}

@Injectable()
export class DashboardService {
  constructor(
    @Inject(SERVICE_NAMES.ORDER) private readonly orderClient: ClientProxy,
    @Inject(SERVICE_NAMES.PAYMENT) private readonly paymentClient: ClientProxy,
    @Inject(SERVICE_NAMES.CATALOG) private readonly catalogClient: ClientProxy,
    @InjectRepository(AnalyticsCache)
    private readonly analyticsCacheRepository: Repository<AnalyticsCache>,
    private readonly logger: CynaLoggerService,
    private readonly configService: ConfigService,
  ) {}

  async getDashboard(period: string = DashboardPeriod.MONTH): Promise<DashboardResult> {
    const cacheKey = `dashboard:${period}`;
    const ttl = this.configService.get<number>('analytics.cache.dashboardTtlSeconds', 300);

    // Check analytics cache in database
    const cached = await this.getCachedMetric(cacheKey);
    if (cached) {
      this.logger.debug(`Dashboard cache hit for period: ${period}`);
      return cached as DashboardResult;
    }

    const dateRange = this.getDateRange(period);

    // Fetch data from other services in parallel with graceful degradation.
    // `fetchAll: true` on GET_SUBSCRIPTIONS returns the full set as a plain
    // array (bypassing the admin pagination envelope) so MRR is computed over
    // every active subscription, not just the first 20.
    const [ordersResult, subscriptionsResult] = await Promise.allSettled([
      this.sendMessage(this.orderClient, MESSAGE_PATTERNS.ORDER.ADMIN_GET_ORDERS, {
        page: 1,
        limit: 10000,
      }),
      this.sendMessage(this.paymentClient, MESSAGE_PATTERNS.PAYMENT.GET_SUBSCRIPTIONS, {
        adminMode: true,
        fetchAll: true,
      }),
    ]);

    const ordersValue = ordersResult.status === 'fulfilled' ? ordersResult.value : [];
    const allOrders: OrderRecord[] = Array.isArray(ordersValue)
      ? (ordersValue as OrderRecord[])
      : ((ordersValue as { data?: OrderRecord[] })?.data ?? []);
    const subscriptionsValue =
      subscriptionsResult.status === 'fulfilled' ? subscriptionsResult.value : [];

    if (ordersResult.status === 'rejected') {
      this.logger.warn(`Failed to fetch orders for dashboard: ${ordersResult.reason}`);
    }
    if (subscriptionsResult.status === 'rejected') {
      this.logger.warn(
        `Failed to fetch subscriptions for dashboard: ${subscriptionsResult.reason}`,
      );
    }

    // Orders/subscriptions are already unwrapped above. Subscriptions also
    // tolerate the legacy paginated envelope `{data, total, ...}` defensively —
    // historically that shape silently zeroed MRR (cf. fix/backoffice-mrr).
    const orders: OrderRecord[] = allOrders;
    const subscriptions: SubscriptionRecord[] = Array.isArray(subscriptionsValue)
      ? (subscriptionsValue as SubscriptionRecord[])
      : ((subscriptionsValue as { data?: SubscriptionRecord[] })?.data ?? []);

    // Filter orders by current period
    const currentOrders = orders.filter((o: OrderRecord) => {
      const orderDate = new Date(o.createdAt);
      return orderDate >= dateRange.start && orderDate <= dateRange.end;
    });

    // Filter orders by previous period
    const prevOrders = orders.filter((o: OrderRecord) => {
      const orderDate = new Date(o.createdAt);
      return orderDate >= dateRange.prevStart && orderDate <= dateRange.prevEnd;
    });

    // Calculate revenue
    const completedStatuses = ['paid', 'completed', 'shipped', 'delivered'];
    const currentPaidOrders = currentOrders.filter((o: OrderRecord) =>
      completedStatuses.includes(o.status),
    );
    const prevPaidOrders = prevOrders.filter((o: OrderRecord) =>
      completedStatuses.includes(o.status),
    );

    const currentRevenue = currentPaidOrders.reduce(
      (sum: number, o: OrderRecord) => sum + (parseFloat(String(o.total)) || 0),
      0,
    );
    const prevRevenue = prevPaidOrders.reduce(
      (sum: number, o: OrderRecord) => sum + (parseFloat(String(o.total)) || 0),
      0,
    );

    // Calculate recurring vs one-time revenue
    const recurringRevenue = currentPaidOrders
      .filter((o: OrderRecord) => o.orderType === 'subscription')
      .reduce((sum: number, o: OrderRecord) => sum + (parseFloat(String(o.total)) || 0), 0);
    const oneTimeRevenue = currentRevenue - recurringRevenue;

    // Order stats
    const completedCount = currentOrders.filter((o: OrderRecord) =>
      completedStatuses.includes(o.status),
    ).length;
    const pendingCount = currentOrders.filter((o: OrderRecord) =>
      ['pending', 'processing'].includes(o.status),
    ).length;
    const cancelledCount = currentOrders.filter(
      (o: OrderRecord) => o.status === 'cancelled',
    ).length;

    // Subscription stats
    const activeSubscriptions = subscriptions.filter(
      (s: SubscriptionRecord) => s.status === 'active',
    );
    const currentNewSubs = subscriptions.filter((s: SubscriptionRecord) => {
      const subDate = new Date(s.createdAt);
      return subDate >= dateRange.start && subDate <= dateRange.end;
    });
    const churnedSubs = subscriptions.filter((s: SubscriptionRecord) => {
      if (s.status !== 'cancelled' && s.status !== 'canceled') return false;
      const cancelDate = new Date((s.cancelledAt || s.updatedAt || new Date()) as string | Date);
      return cancelDate >= dateRange.start && cancelDate <= dateRange.end;
    });

    // MRR calculation
    const mrr = activeSubscriptions.reduce((sum: number, s: SubscriptionRecord) => {
      const amount = parseFloat(String(s.price)) || 0;
      if (s.billingPeriod === 'yearly' || s.billingPeriod === 'annual') {
        return sum + amount / 12;
      }
      return sum + amount;
    }, 0);

    // Change percentages
    const revenueChange = this.calcChangePercent(currentRevenue, prevRevenue);
    const ordersChange = this.calcChangePercent(currentOrders.length, prevOrders.length);

    const prevActiveSubsCount = subscriptions.filter((s: SubscriptionRecord) => {
      const subDate = new Date(s.createdAt);
      return (
        subDate <= dateRange.prevEnd &&
        (s.status === 'active' ||
          new Date((s.cancelledAt || s.updatedAt || new Date()) as string | Date) >
            dateRange.prevEnd)
      );
    }).length;
    const subsChange = this.calcChangePercent(activeSubscriptions.length, prevActiveSubsCount);

    // Average order value
    const averageOrderValue =
      currentPaidOrders.length > 0 ? currentRevenue / currentPaidOrders.length : 0;

    const result: DashboardResult = {
      revenue: {
        total: Math.round(currentRevenue * 100) / 100,
        recurring: Math.round(recurringRevenue * 100) / 100,
        oneTime: Math.round(oneTimeRevenue * 100) / 100,
        currency: 'EUR',
        changePercent: revenueChange,
      },
      orders: {
        total: currentOrders.length,
        completed: completedCount,
        pending: pendingCount,
        cancelled: cancelledCount,
        changePercent: ordersChange,
      },
      subscriptions: {
        active: activeSubscriptions.length,
        new: currentNewSubs.length,
        churned: churnedSubs.length,
        mrr: Math.round(mrr * 100) / 100,
        changePercent: subsChange,
      },
      averageOrderValue: Math.round(averageOrderValue * 100) / 100,
      conversionRate: 3.5,
    };

    // Cache the result
    await this.setCachedMetric(cacheKey, result, ttl);
    this.logger.log(`Dashboard computed for period: ${period}`);

    return result;
  }

  /**
   * Calculate date range for current and previous period
   */
  getDateRange(period: string): DateRange {
    const now = new Date();
    let start: Date;
    let prevStart: Date;
    let prevEnd: Date;

    switch (period) {
      case DashboardPeriod.TODAY: {
        start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        prevStart = new Date(start);
        prevStart.setUTCDate(prevStart.getUTCDate() - 1);
        prevEnd = new Date(start);
        prevEnd.setUTCMilliseconds(-1);
        break;
      }
      case DashboardPeriod.WEEK: {
        // Monday 00:00 UTC of current week
        const dayOfWeek = now.getUTCDay();
        const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        start = new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - mondayOffset),
        );
        prevStart = new Date(start);
        prevStart.setUTCDate(prevStart.getUTCDate() - 7);
        prevEnd = new Date(start);
        prevEnd.setUTCMilliseconds(-1);
        break;
      }
      case DashboardPeriod.QUARTER: {
        const quarterMonth = Math.floor(now.getUTCMonth() / 3) * 3;
        start = new Date(Date.UTC(now.getUTCFullYear(), quarterMonth, 1));
        prevStart = new Date(Date.UTC(now.getUTCFullYear(), quarterMonth - 3, 1));
        prevEnd = new Date(start);
        prevEnd.setUTCMilliseconds(-1);
        break;
      }
      case DashboardPeriod.YEAR: {
        start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
        prevStart = new Date(Date.UTC(now.getUTCFullYear() - 1, 0, 1));
        prevEnd = new Date(start);
        prevEnd.setUTCMilliseconds(-1);
        break;
      }
      case DashboardPeriod.MONTH:
      default: {
        start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        prevStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
        prevEnd = new Date(start);
        prevEnd.setUTCMilliseconds(-1);
        break;
      }
    }

    return { start, end: now, prevStart, prevEnd };
  }

  /**
   * Calculate change percentage between current and previous values
   */
  private calcChangePercent(current: number, previous: number): number {
    if (previous === 0) {
      return current > 0 ? 100 : 0;
    }
    return Math.round(((current - previous) / previous) * 10000) / 100;
  }

  /**
   * Send a message to a client with timeout, retry, and error handling
   */
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
              message: 'errors.common.serviceUnavailable',
              code: 'SERVICE_TIMEOUT',
            });
          }
          throw err;
        }),
      ),
    );
  }

  /**
   * Get a cached metric from the analytics_cache table
   */
  private async getCachedMetric(key: string): Promise<unknown | null> {
    try {
      const cached = await this.analyticsCacheRepository.findOne({
        where: {
          metricKey: key,
          expiresAt: MoreThan(new Date()),
        },
      });
      return cached ? cached.metricValue : null;
    } catch {
      this.logger.warn(`Failed to read analytics cache for key: ${key}`);
      return null;
    }
  }

  /**
   * Set a cached metric in the analytics_cache table
   */
  private async setCachedMetric(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);

      const existing = await this.analyticsCacheRepository.findOne({
        where: { metricKey: key },
      });

      const metricValue = value as Record<string, unknown>;
      if (existing) {
        existing.metricValue = metricValue;
        existing.calculatedAt = now;
        existing.expiresAt = expiresAt;
        await this.analyticsCacheRepository.save(existing);
      } else {
        const cacheEntry = this.analyticsCacheRepository.create({
          metricKey: key,
          metricValue,
          calculatedAt: now,
          expiresAt,
        });
        await this.analyticsCacheRepository.save(cacheEntry);
      }
    } catch {
      this.logger.warn(`Failed to write analytics cache for key: ${key}`);
    }
  }
}
