import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy, RpcException } from '@nestjs/microservices';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { firstValueFrom, timeout, retry, catchError, TimeoutError } from 'rxjs';
import {
  CynaLoggerService,
  SERVICE_NAMES,
  MESSAGE_PATTERNS,
  VAT_MULTIPLIER,
} from '@cyna-api/common';
import { ConfigService } from '@nestjs/config';
import { AnalyticsCache } from '../entities';
import { SalesPeriod, SalesGroupBy } from '../dto';

export interface SalesSeriesEntry {
  date: string;
  revenue: number;
  orders: number;
}

export interface SalesResult {
  period: string;
  groupBy: string;
  series: SalesSeriesEntry[];
  totals: {
    revenue: number;
    orders: number;
  };
}

export interface CategorySalesEntry {
  categoryId: string;
  name: string;
  revenue: number;
  percentage: number;
}

export interface ProductTypeSalesEntry {
  type: string;
  revenue: number;
  percentage: number;
  count: number;
}

export type AverageCartProductType = 'saas' | 'physical' | 'license';

export interface AverageCartByProductTypeEntry {
  productType: AverageCartProductType;
  averageCartValue: number;
  orderCount: number;
}

export interface AverageCartByProductTypeResult {
  period: string;
  data: AverageCartByProductTypeEntry[];
}

export interface MrrHistory {
  month: string;
  mrr: number;
}

export interface MrrResult {
  currentMrr: number;
  history: MrrHistory[];
  growth: {
    monthOverMonth: number;
    yearOverYear: number;
  };
}

export interface StockProductEntry {
  productId: string;
  name: string;
  currentStock: number;
  threshold: number;
  status: string;
}

export interface StockStatusResult {
  summary: {
    totalProducts: number;
    inStock: number;
    lowStock: number;
    outOfStock: number;
  };
  products: StockProductEntry[];
}

interface OrderRecord {
  createdAt: string | Date;
  status: string;
  total: string | number;
  items?: Array<{
    productId: string;
    unitPrice: string | number;
    quantity: number;
  }>;
}

interface SubscriptionRecord {
  status: string;
  createdAt: string | Date;
  cancelledAt?: string | Date | null;
  updatedAt?: string | Date;
  price: string | number;
  billingPeriod?: string;
}

interface ProductRecord {
  id: string;
  categoryId?: string;
  categoryName?: string;
  category?: { nameFr?: string };
  productType?: string;
  stockQuantity?: number | null;
  stock?: number | null;
  stockAlertThreshold?: number;
}

interface StockAlertRecord {
  id?: string;
  productId?: string;
  name?: string;
  nameFr?: string;
  nameEn?: string;
  productName?: string;
  sku?: string;
  stockQuantity?: number;
  currentStock?: number;
  stockAlertThreshold?: number;
  threshold?: number;
}

interface PaginatedResponse {
  data: ProductRecord[];
}

@Injectable()
export class SalesService {
  constructor(
    @Inject(SERVICE_NAMES.ORDER) private readonly orderClient: ClientProxy,
    @Inject(SERVICE_NAMES.PAYMENT) private readonly paymentClient: ClientProxy,
    @Inject(SERVICE_NAMES.CATALOG) private readonly catalogClient: ClientProxy,
    @InjectRepository(AnalyticsCache)
    private readonly analyticsCacheRepository: Repository<AnalyticsCache>,
    private readonly logger: CynaLoggerService,
    private readonly configService: ConfigService,
  ) {}

  async getSales(
    period: string = SalesPeriod.MONTH,
    groupBy: string = SalesGroupBy.DAY,
  ): Promise<SalesResult> {
    const cacheKey = `sales:${period}:${groupBy}`;
    const ttl = this.configService.get<number>('analytics.cache.salesTtlSeconds', 300);

    const cached = await this.getCachedMetric(cacheKey);
    if (cached) {
      return cached as SalesResult;
    }

    const dateRange = this.getDateRangeForPeriod(period);
    const orders = await this.fetchOrders();

    const paidStatuses = ['paid', 'completed', 'shipped', 'delivered'];
    const filteredOrders = orders.filter((o: OrderRecord) => {
      const orderDate = new Date(o.createdAt);
      return (
        orderDate >= dateRange.start &&
        orderDate <= dateRange.end &&
        paidStatuses.includes(o.status)
      );
    });

    // Group orders by date bucket
    const grouped = new Map<string, { revenue: number; orders: number }>();
    const buckets = this.generateDateBuckets(dateRange.start, dateRange.end, groupBy);

    for (const bucket of buckets) {
      grouped.set(bucket, { revenue: 0, orders: 0 });
    }

    for (const order of filteredOrders) {
      const bucket = this.getDateBucket(new Date(order.createdAt), groupBy);
      const entry = grouped.get(bucket);
      if (entry) {
        entry.revenue += parseFloat(String(order.total)) || 0;
        entry.orders += 1;
      }
    }

    const series: SalesSeriesEntry[] = [];
    let totalRevenue = 0;
    let totalOrders = 0;

    for (const [date, data] of grouped) {
      series.push({
        date,
        revenue: Math.round(data.revenue * 100) / 100,
        orders: data.orders,
      });
      totalRevenue += data.revenue;
      totalOrders += data.orders;
    }

    const result: SalesResult = {
      period,
      groupBy,
      series,
      totals: {
        revenue: Math.round(totalRevenue * 100) / 100,
        orders: totalOrders,
      },
    };

    await this.setCachedMetric(cacheKey, result, ttl);
    this.logger.log(`Sales computed for period: ${period}, groupBy: ${groupBy}`);

    return result;
  }

  async getSalesByCategory(period: string = SalesPeriod.MONTH): Promise<{
    period: string;
    categories: CategorySalesEntry[];
  }> {
    const cacheKey = `sales-by-category:${period}`;
    const ttl = this.configService.get<number>('analytics.cache.salesTtlSeconds', 300);

    const cached = await this.getCachedMetric(cacheKey);
    if (cached) {
      return cached as { period: string; categories: CategorySalesEntry[] };
    }

    const dateRange = this.getDateRangeForPeriod(period);

    const [ordersResult, productsResult] = await Promise.allSettled([
      this.fetchOrders(),
      this.sendMessage(this.catalogClient, MESSAGE_PATTERNS.CATALOG.PRODUCT_FIND_ALL, {
        page: 1,
        limit: 100,
      }),
    ]);

    const orders = ordersResult.status === 'fulfilled' ? ordersResult.value : [];
    const productsResponse =
      productsResult.status === 'fulfilled' ? productsResult.value : { data: [] };
    const products = Array.isArray(productsResponse)
      ? productsResponse
      : (productsResponse as PaginatedResponse)?.data || [];

    // Build product -> category map
    const productCategoryMap = new Map<string, { categoryId: string; categoryName: string }>();
    for (const product of products) {
      if (product.categoryId) {
        productCategoryMap.set(product.id, {
          categoryId: product.categoryId,
          categoryName: product.categoryName || product.category?.nameFr || 'Unknown',
        });
      }
    }

    const paidStatuses = ['paid', 'completed', 'shipped', 'delivered'];
    const filteredOrders = orders.filter((o: OrderRecord) => {
      const orderDate = new Date(o.createdAt);
      return (
        orderDate >= dateRange.start &&
        orderDate <= dateRange.end &&
        paidStatuses.includes(o.status)
      );
    });

    // Aggregate by category
    const categoryRevenue = new Map<string, { name: string; revenue: number }>();
    let totalRevenue = 0;

    for (const order of filteredOrders) {
      const items = order.items || [];
      for (const item of items) {
        const productInfo = productCategoryMap.get(item.productId);
        const categoryId = productInfo?.categoryId || 'unknown';
        const categoryName = productInfo?.categoryName || 'Unknown';
        // unitPrice is HT — convert to TTC to align with order.total-based aggregations.
        const itemRevenue =
          (parseFloat(String(item.unitPrice)) || 0) * (item.quantity || 1) * VAT_MULTIPLIER;

        const existing = categoryRevenue.get(categoryId);
        if (existing) {
          existing.revenue += itemRevenue;
        } else {
          categoryRevenue.set(categoryId, { name: categoryName, revenue: itemRevenue });
        }
        totalRevenue += itemRevenue;
      }
    }

    const categories: CategorySalesEntry[] = [];
    for (const [categoryId, data] of categoryRevenue) {
      categories.push({
        categoryId,
        name: data.name,
        revenue: Math.round(data.revenue * 100) / 100,
        percentage: totalRevenue > 0 ? Math.round((data.revenue / totalRevenue) * 10000) / 100 : 0,
      });
    }

    // Sort by revenue descending
    categories.sort((a, b) => b.revenue - a.revenue);

    const result = { period, categories };
    await this.setCachedMetric(cacheKey, result, ttl);
    this.logger.log(`Sales by category computed for period: ${period}`);

    return result;
  }

  async getSalesByProductType(period: string = SalesPeriod.MONTH): Promise<{
    period: string;
    productTypes: ProductTypeSalesEntry[];
  }> {
    const cacheKey = `sales-by-product-type:${period}`;
    const ttl = this.configService.get<number>('analytics.cache.salesTtlSeconds', 300);

    const cached = await this.getCachedMetric(cacheKey);
    if (cached) {
      return cached as { period: string; productTypes: ProductTypeSalesEntry[] };
    }

    const dateRange = this.getDateRangeForPeriod(period);

    const [ordersResult, productsResult] = await Promise.allSettled([
      this.fetchOrders(),
      this.sendMessage(this.catalogClient, MESSAGE_PATTERNS.CATALOG.PRODUCT_FIND_ALL, {
        page: 1,
        limit: 100,
      }),
    ]);

    const orders = ordersResult.status === 'fulfilled' ? ordersResult.value : [];
    const productsResponse =
      productsResult.status === 'fulfilled' ? productsResult.value : { data: [] };
    const products = Array.isArray(productsResponse)
      ? productsResponse
      : (productsResponse as PaginatedResponse)?.data || [];

    // Build product -> type map
    const productTypeMap = new Map<string, string>();
    for (const product of products) {
      productTypeMap.set(product.id, product.productType || 'unknown');
    }

    const paidStatuses = ['paid', 'completed', 'shipped', 'delivered'];
    const filteredOrders = orders.filter((o: OrderRecord) => {
      const orderDate = new Date(o.createdAt);
      return (
        orderDate >= dateRange.start &&
        orderDate <= dateRange.end &&
        paidStatuses.includes(o.status)
      );
    });

    // Aggregate by product type
    const typeRevenue = new Map<string, { revenue: number; count: number }>();
    let totalRevenue = 0;

    for (const order of filteredOrders) {
      const items = order.items || [];
      for (const item of items) {
        const productType = productTypeMap.get(item.productId) || 'unknown';
        // unitPrice is HT — convert to TTC to align with order.total-based aggregations.
        const itemRevenue =
          (parseFloat(String(item.unitPrice)) || 0) * (item.quantity || 1) * VAT_MULTIPLIER;

        const existing = typeRevenue.get(productType);
        if (existing) {
          existing.revenue += itemRevenue;
          existing.count += item.quantity || 1;
        } else {
          typeRevenue.set(productType, { revenue: itemRevenue, count: item.quantity || 1 });
        }
        totalRevenue += itemRevenue;
      }
    }

    const productTypes: ProductTypeSalesEntry[] = [];
    for (const [type, data] of typeRevenue) {
      productTypes.push({
        type,
        revenue: Math.round(data.revenue * 100) / 100,
        percentage: totalRevenue > 0 ? Math.round((data.revenue / totalRevenue) * 10000) / 100 : 0,
        count: data.count,
      });
    }

    // Sort by revenue descending
    productTypes.sort((a, b) => b.revenue - a.revenue);

    const result = { period, productTypes };
    await this.setCachedMetric(cacheKey, result, ttl);
    this.logger.log(`Sales by product type computed for period: ${period}`);

    return result;
  }

  async getAverageCart(period: string = SalesPeriod.MONTH): Promise<{
    period: string;
    averageCartValue: number;
    totalOrders: number;
    totalRevenue: number;
  }> {
    const cacheKey = `average-cart:${period}`;
    const ttl = this.configService.get<number>('analytics.cache.salesTtlSeconds', 300);

    const cached = await this.getCachedMetric(cacheKey);
    if (cached) {
      return cached as {
        period: string;
        averageCartValue: number;
        totalOrders: number;
        totalRevenue: number;
      };
    }

    const dateRange = this.getDateRangeForPeriod(period);
    const orders = await this.fetchOrders();

    const paidStatuses = ['paid', 'completed', 'shipped', 'delivered'];
    const filteredOrders = orders.filter((o: OrderRecord) => {
      const orderDate = new Date(o.createdAt);
      return (
        orderDate >= dateRange.start &&
        orderDate <= dateRange.end &&
        paidStatuses.includes(o.status)
      );
    });

    const totalRevenue = filteredOrders.reduce(
      (sum: number, o: OrderRecord) => sum + (parseFloat(String(o.total)) || 0),
      0,
    );

    const averageCartValue = filteredOrders.length > 0 ? totalRevenue / filteredOrders.length : 0;

    const result = {
      period,
      averageCartValue: Math.round(averageCartValue * 100) / 100,
      totalOrders: filteredOrders.length,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
    };

    await this.setCachedMetric(cacheKey, result, ttl);
    this.logger.log(`Average cart computed for period: ${period}`);

    return result;
  }

  async getAverageCartByProductType(
    period: string = SalesPeriod.MONTH,
  ): Promise<AverageCartByProductTypeResult> {
    const cacheKey = `average-cart-by-product-type:${period}`;
    const ttl = this.configService.get<number>('analytics.cache.salesTtlSeconds', 300);

    const cached = await this.getCachedMetric(cacheKey);
    if (cached) {
      return cached as AverageCartByProductTypeResult;
    }

    const dateRange = this.getDateRangeForPeriod(period);

    const [ordersResult, productsResult] = await Promise.allSettled([
      this.fetchOrders(),
      this.sendMessage(this.catalogClient, MESSAGE_PATTERNS.CATALOG.PRODUCT_FIND_ALL, {
        page: 1,
        limit: 100,
      }),
    ]);

    const orders = ordersResult.status === 'fulfilled' ? ordersResult.value : [];
    const productsResponse =
      productsResult.status === 'fulfilled' ? productsResult.value : { data: [] };
    const products = Array.isArray(productsResponse)
      ? productsResponse
      : (productsResponse as PaginatedResponse)?.data || [];

    // Build product -> type map
    const productTypeMap = new Map<string, string>();
    for (const product of products) {
      productTypeMap.set(product.id, product.productType || 'unknown');
    }

    const paidStatuses = ['paid', 'completed', 'shipped', 'delivered'];
    const filteredOrders = orders.filter((o: OrderRecord) => {
      const orderDate = new Date(o.createdAt);
      return (
        orderDate >= dateRange.start &&
        orderDate <= dateRange.end &&
        paidStatuses.includes(o.status)
      );
    });

    const supportedTypes: AverageCartProductType[] = ['saas', 'physical', 'license'];
    const totals = new Map<AverageCartProductType, { sum: number; orders: number }>();
    for (const type of supportedTypes) {
      totals.set(type, { sum: 0, orders: 0 });
    }

    // For each order, compute subtotal per productType, then contribute to that type's running avg
    for (const order of filteredOrders) {
      const items = order.items || [];
      const perTypeSubtotal = new Map<AverageCartProductType, number>();

      for (const item of items) {
        const rawType = productTypeMap.get(item.productId) || 'unknown';
        const normalized = this.normalizeProductType(rawType);
        if (!normalized) continue;

        // unitPrice is HT — convert to TTC so the average cart by product type
        // is comparable to the global average cart computed from order.total (TTC).
        const itemTotal =
          (parseFloat(String(item.unitPrice)) || 0) * (item.quantity || 1) * VAT_MULTIPLIER;
        perTypeSubtotal.set(normalized, (perTypeSubtotal.get(normalized) || 0) + itemTotal);
      }

      for (const [type, subtotal] of perTypeSubtotal) {
        if (subtotal <= 0) continue;
        const bucket = totals.get(type);
        if (bucket) {
          bucket.sum += subtotal;
          bucket.orders += 1;
        }
      }
    }

    const data: AverageCartByProductTypeEntry[] = supportedTypes.map((type) => {
      const bucket = totals.get(type) ?? { sum: 0, orders: 0 };
      const avg = bucket.orders > 0 ? bucket.sum / bucket.orders : 0;
      return {
        productType: type,
        averageCartValue: Math.round(avg * 100) / 100,
        orderCount: bucket.orders,
      };
    });

    const result: AverageCartByProductTypeResult = { period, data };

    await this.setCachedMetric(cacheKey, result, ttl);
    this.logger.log(`Average cart by product type computed for period: ${period}`);

    return result;
  }

  private normalizeProductType(raw: string): AverageCartProductType | null {
    const value = (raw || '').toLowerCase().trim();
    if (value === 'saas' || value === 'subscription') return 'saas';
    if (value === 'physical' || value === 'hardware') return 'physical';
    if (value === 'license' || value === 'licence' || value === 'digital') return 'license';
    return null;
  }

  async getMrr(): Promise<MrrResult> {
    const cacheKey = 'mrr:current';
    const ttl = this.configService.get<number>('analytics.cache.mrrTtlSeconds', 600);

    const cached = await this.getCachedMetric(cacheKey);
    if (cached) {
      return cached as MrrResult;
    }

    const subscriptions = await this.fetchSubscriptions();
    const activeSubscriptions = subscriptions.filter(
      (s: SubscriptionRecord) => s.status === 'active',
    );

    // Calculate current MRR — Subscription.price is stored HT, convert to TTC
    // for consistency with revenue/AOV which aggregate Order.total (TTC).
    const currentMrr = activeSubscriptions.reduce((sum: number, s: SubscriptionRecord) => {
      const amount = (parseFloat(String(s.price)) || 0) * VAT_MULTIPLIER;
      if (s.billingPeriod === 'yearly' || s.billingPeriod === 'annual') {
        return sum + amount / 12;
      }
      return sum + amount;
    }, 0);

    // Build MRR history for last 12 months
    const history: MrrHistory[] = [];
    const now = new Date();

    for (let i = 11; i >= 0; i--) {
      const monthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
      const monthEnd = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i + 1, 0, 23, 59, 59),
      );
      const monthLabel = monthDate.toISOString().slice(0, 7); // YYYY-MM

      // Check history cache
      const historyCacheKey = `mrr:history:${monthLabel}`;
      const cachedMonth = await this.getCachedMetric(historyCacheKey);

      if (cachedMonth && i > 0) {
        history.push(cachedMonth as MrrHistory);
      } else {
        // Calculate MRR for this month based on subscriptions active at month end
        const monthMrr = subscriptions
          .filter((s: SubscriptionRecord) => {
            const createdAt = new Date(s.createdAt);
            if (createdAt > monthEnd) return false;
            if (s.status === 'active') return true;
            // If cancelled, was it active at month end?
            if (s.cancelledAt) {
              return new Date(s.cancelledAt) > monthEnd;
            }
            return false;
          })
          .reduce((sum: number, s: SubscriptionRecord) => {
            const amount = (parseFloat(String(s.price)) || 0) * VAT_MULTIPLIER;
            if (s.billingPeriod === 'yearly' || s.billingPeriod === 'annual') {
              return sum + amount / 12;
            }
            return sum + amount;
          }, 0);

        const entry: MrrHistory = {
          month: monthLabel,
          mrr: Math.round(monthMrr * 100) / 100,
        };

        // Cache past months (not the current one as it can change)
        if (i > 0) {
          await this.setCachedMetric(historyCacheKey, entry, 86400); // 24h cache for past months
        }

        history.push(entry);
      }
    }

    // Calculate growth
    const lastMonthMrr = history.length >= 2 ? history[history.length - 2].mrr : 0;
    const monthOverMonth =
      lastMonthMrr > 0
        ? Math.round(((currentMrr - lastMonthMrr) / lastMonthMrr) * 10000) / 100
        : currentMrr > 0
          ? 100
          : 0;

    const yearAgoMrr = history.length >= 12 ? history[0].mrr : 0;
    const yearOverYear =
      yearAgoMrr > 0
        ? Math.round(((currentMrr - yearAgoMrr) / yearAgoMrr) * 10000) / 100
        : currentMrr > 0
          ? 100
          : 0;

    const result: MrrResult = {
      currentMrr: Math.round(currentMrr * 100) / 100,
      history,
      growth: {
        monthOverMonth,
        yearOverYear,
      },
    };

    await this.setCachedMetric(cacheKey, result, ttl);
    this.logger.log('MRR computed');

    return result;
  }

  async getStockStatus(): Promise<StockStatusResult> {
    const cacheKey = 'stock-status';
    const ttl = this.configService.get<number>('analytics.cache.stockTtlSeconds', 120);

    const cached = await this.getCachedMetric(cacheKey);
    if (cached) {
      return cached as StockStatusResult;
    }

    const [alertsResult, productsResult] = await Promise.allSettled([
      this.sendMessage(this.catalogClient, MESSAGE_PATTERNS.CATALOG.STOCK_GET_ALERTS, {}),
      this.sendMessage(this.catalogClient, MESSAGE_PATTERNS.CATALOG.PRODUCT_FIND_ALL, {
        page: 1,
        limit: 100,
      }),
    ]);

    const alerts =
      alertsResult.status === 'fulfilled'
        ? Array.isArray(alertsResult.value)
          ? alertsResult.value
          : []
        : [];
    const productsResponse =
      productsResult.status === 'fulfilled' ? productsResult.value : { data: [] };
    const products = Array.isArray(productsResponse)
      ? productsResponse
      : (productsResponse as PaginatedResponse)?.data || [];

    if (alertsResult.status === 'rejected') {
      this.logger.warn(`Failed to fetch stock alerts: ${alertsResult.reason}`);
    }
    if (productsResult.status === 'rejected') {
      this.logger.warn(`Failed to fetch products for stock status: ${productsResult.reason}`);
    }

    // Stock counts only apply to physical products — SaaS/licenses have stockQuantity=null
    const physicalProducts = products.filter((p) => p.productType === 'physical');
    const totalProducts = physicalProducts.length;
    const lowStockIds = new Set(alerts.map((a: StockAlertRecord) => a.productId || a.id));

    let inStock = 0;
    let lowStock = 0;
    let outOfStock = 0;

    for (const product of physicalProducts) {
      const qty = product.stockQuantity ?? product.stock ?? 0;
      if (qty <= 0) {
        outOfStock++;
      } else if (lowStockIds.has(product.id)) {
        lowStock++;
      } else {
        inStock++;
      }
    }

    const result: StockStatusResult = {
      summary: {
        totalProducts,
        inStock,
        lowStock,
        outOfStock,
      },
      products: alerts.map((a: StockAlertRecord) => ({
        productId: a.productId || a.id || '',
        name: a.nameFr || a.nameEn || a.name || a.productName || 'Unknown',
        currentStock: a.stockQuantity ?? a.currentStock ?? 0,
        threshold: a.stockAlertThreshold ?? a.threshold ?? 0,
        status: (a.stockQuantity ?? a.currentStock ?? 0) <= 0 ? 'out_of_stock' : 'low_stock',
      })),
    };

    await this.setCachedMetric(cacheKey, result, ttl);
    this.logger.log('Stock status computed');

    return result;
  }

  // ==================== Private helpers ====================

  private async fetchOrders(): Promise<OrderRecord[]> {
    try {
      const result = await this.sendMessage<OrderRecord[] | { data: OrderRecord[] }>(
        this.orderClient,
        MESSAGE_PATTERNS.ORDER.ADMIN_GET_ORDERS,
        { page: 1, limit: 10000 },
      );
      return Array.isArray(result) ? result : (result as { data: OrderRecord[] })?.data || [];
    } catch {
      this.logger.warn('Failed to fetch orders for sales analytics');
      return [];
    }
  }

  private async fetchSubscriptions(): Promise<SubscriptionRecord[]> {
    try {
      // `fetchAll: true` returns the full set as a plain array. Without it,
      // adminMode returns a paginated envelope and the previous
      // `Array.isArray` check silently fell back to [] (cf. fix/backoffice-mrr).
      const result = await this.sendMessage<SubscriptionRecord[] | { data?: SubscriptionRecord[] }>(
        this.paymentClient,
        MESSAGE_PATTERNS.PAYMENT.GET_SUBSCRIPTIONS,
        {
          adminMode: true,
          fetchAll: true,
        },
      );
      if (Array.isArray(result)) return result;
      return result?.data ?? [];
    } catch {
      this.logger.warn('Failed to fetch subscriptions for sales analytics');
      return [];
    }
  }

  private getDateRangeForPeriod(period: string): { start: Date; end: Date } {
    const now = new Date();

    switch (period) {
      case SalesPeriod.TODAY: {
        // Start of today UTC (00:00:00) → now. Mirrors DashboardService.TODAY.
        const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        return { start, end: now };
      }
      case SalesPeriod.WEEK: {
        const dayOfWeek = now.getUTCDay();
        const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        const start = new Date(
          Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - mondayOffset),
        );
        return { start, end: now };
      }
      case SalesPeriod.QUARTER: {
        const quarterMonth = Math.floor(now.getUTCMonth() / 3) * 3;
        const start = new Date(Date.UTC(now.getUTCFullYear(), quarterMonth, 1));
        return { start, end: now };
      }
      case SalesPeriod.YEAR: {
        const start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
        return { start, end: now };
      }
      case SalesPeriod.MONTH:
      default: {
        const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
        return { start, end: now };
      }
    }
  }

  private generateDateBuckets(start: Date, end: Date, groupBy: string): string[] {
    const buckets: string[] = [];
    const current = new Date(start);

    while (current <= end) {
      buckets.push(this.getDateBucket(current, groupBy));

      switch (groupBy) {
        case SalesGroupBy.DAY:
          current.setUTCDate(current.getUTCDate() + 1);
          break;
        case SalesGroupBy.WEEK:
          current.setUTCDate(current.getUTCDate() + 7);
          break;
        case SalesGroupBy.MONTH:
          current.setUTCMonth(current.getUTCMonth() + 1);
          break;
        default:
          current.setUTCDate(current.getUTCDate() + 1);
      }
    }

    return buckets;
  }

  private getDateBucket(date: Date, groupBy: string): string {
    switch (groupBy) {
      case SalesGroupBy.WEEK: {
        // Return Monday of the week as ISO date
        const d = new Date(date);
        const day = d.getUTCDay();
        const diff = day === 0 ? 6 : day - 1;
        d.setUTCDate(d.getUTCDate() - diff);
        return d.toISOString().slice(0, 10);
      }
      case SalesGroupBy.MONTH:
        return date.toISOString().slice(0, 7); // YYYY-MM
      case SalesGroupBy.DAY:
      default:
        return date.toISOString().slice(0, 10); // YYYY-MM-DD
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
              message: 'errors.common.serviceUnavailable',
              code: 'SERVICE_TIMEOUT',
            });
          }
          throw err;
        }),
      ),
    );
  }

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
