import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import { CynaLoggerService, SERVICE_NAMES } from '@cyna-api/common';
import { SalesService } from './sales.service';
import { AnalyticsCache } from '../entities';

describe('SalesService', () => {
  let service: SalesService;
  let orderClient: { send: jest.Mock };
  let paymentClient: { send: jest.Mock };
  let catalogClient: { send: jest.Mock };
  let repo: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let logger: { log: jest.Mock; warn: jest.Mock };
  let configService: { get: jest.Mock };

  const recentDate = () => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 5)).toISOString();
  };

  beforeEach(async () => {
    orderClient = { send: jest.fn().mockReturnValue(of([])) };
    paymentClient = { send: jest.fn().mockReturnValue(of([])) };
    catalogClient = { send: jest.fn().mockReturnValue(of({ data: [] })) };
    repo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((dto) => dto),
      save: jest.fn(),
    };
    logger = { log: jest.fn(), warn: jest.fn() };
    configService = { get: jest.fn().mockReturnValue(300) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SalesService,
        { provide: SERVICE_NAMES.ORDER, useValue: orderClient },
        { provide: SERVICE_NAMES.PAYMENT, useValue: paymentClient },
        { provide: SERVICE_NAMES.CATALOG, useValue: catalogClient },
        { provide: getRepositoryToken(AnalyticsCache), useValue: repo },
        { provide: CynaLoggerService, useValue: logger },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();
    service = module.get(SalesService);
  });

  describe('getSales', () => {
    it('returns cached value when present', async () => {
      const cached = {
        period: 'month',
        groupBy: 'day',
        series: [],
        totals: { revenue: 0, orders: 0 },
      };
      repo.findOne.mockResolvedValueOnce({ metricValue: cached });
      const r = await service.getSales('month', 'day');
      expect(r).toEqual(cached);
    });

    it('computes sales series with day groupBy', async () => {
      orderClient.send.mockReturnValue(
        of([
          { createdAt: recentDate(), status: 'paid', total: '100' },
          { createdAt: recentDate(), status: 'pending', total: '50' },
        ]),
      );
      const r = await service.getSales('month', 'day');
      expect(r.totals.revenue).toBe(100);
      expect(r.totals.orders).toBe(1);
    });

    it.each(['today', 'week', 'month', 'quarter', 'year'])('handles %s period', async (period) => {
      orderClient.send.mockReturnValue(of([]));
      const r = await service.getSales(period, 'day');
      expect(r.period).toBe(period);
    });

    it('handles week and month groupBy', async () => {
      orderClient.send.mockReturnValue(of([]));
      await service.getSales('month', 'week');
      await service.getSales('year', 'month');
      expect(logger.log).toHaveBeenCalled();
    });

    it('handles paginated order envelope', async () => {
      orderClient.send.mockReturnValue(of({ data: [] }));
      const r = await service.getSales('month', 'day');
      expect(r.totals.revenue).toBe(0);
    });

    it('falls back to empty array on order fetch error', async () => {
      orderClient.send.mockReturnValue(throwError(() => new Error('down')));
      const r = await service.getSales('month', 'day');
      expect(r.totals.revenue).toBe(0);
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe('getSalesByCategory', () => {
    it('groups revenue by category', async () => {
      orderClient.send.mockReturnValue(
        of([
          {
            createdAt: recentDate(),
            status: 'paid',
            total: '100',
            items: [{ productId: 'p1', unitPrice: '100', quantity: 1 }],
          },
        ]),
      );
      catalogClient.send.mockReturnValue(
        of({
          data: [
            {
              id: 'p1',
              categoryId: 'c1',
              categoryName: 'Cat',
            },
          ],
        }),
      );
      const r = await service.getSalesByCategory('month');
      expect(r.categories.length).toBeGreaterThan(0);
      expect(r.categories[0].name).toBe('Cat');
    });

    it('returns cached value when present', async () => {
      repo.findOne.mockResolvedValueOnce({ metricValue: { period: 'month', categories: [] } });
      const r = await service.getSalesByCategory('month');
      expect(r.categories).toEqual([]);
    });

    it('falls back to Unknown for missing category mapping', async () => {
      orderClient.send.mockReturnValue(
        of([
          {
            createdAt: recentDate(),
            status: 'paid',
            total: '50',
            items: [{ productId: 'unmapped', unitPrice: '50', quantity: 1 }],
          },
        ]),
      );
      catalogClient.send.mockReturnValue(of({ data: [] }));
      const r = await service.getSalesByCategory('month');
      expect(r.categories[0]?.name).toBe('Unknown');
    });

    it('handles catalog rejection with empty products', async () => {
      orderClient.send.mockReturnValue(of([]));
      catalogClient.send.mockReturnValue(throwError(() => new Error('catalog down')));
      const r = await service.getSalesByCategory('month');
      expect(r.categories).toEqual([]);
    });

    it('accepts catalog response as plain array', async () => {
      orderClient.send.mockReturnValue(of([]));
      catalogClient.send.mockReturnValue(of([]));
      const r = await service.getSalesByCategory('month');
      expect(r.categories).toEqual([]);
    });
  });

  describe('getSalesByProductType', () => {
    it('groups by product type', async () => {
      orderClient.send.mockReturnValue(
        of([
          {
            createdAt: recentDate(),
            status: 'paid',
            total: '100',
            items: [{ productId: 'p1', unitPrice: '100', quantity: 1 }],
          },
        ]),
      );
      catalogClient.send.mockReturnValue(of({ data: [{ id: 'p1', productType: 'saas' }] }));
      const r = await service.getSalesByProductType('month');
      expect(r.productTypes.find((p) => p.type === 'saas')).toBeDefined();
    });

    it('returns cached', async () => {
      repo.findOne.mockResolvedValueOnce({ metricValue: { period: 'month', productTypes: [] } });
      const r = await service.getSalesByProductType('month');
      expect(r.productTypes).toEqual([]);
    });

    it('marks unknown for unmapped products', async () => {
      orderClient.send.mockReturnValue(
        of([
          {
            createdAt: recentDate(),
            status: 'paid',
            total: '50',
            items: [{ productId: 'x', unitPrice: '50', quantity: 1 }],
          },
        ]),
      );
      catalogClient.send.mockReturnValue(of({ data: [] }));
      const r = await service.getSalesByProductType('month');
      expect(r.productTypes[0].type).toBe('unknown');
    });
  });

  describe('getAverageCart', () => {
    it('computes average', async () => {
      orderClient.send.mockReturnValue(
        of([
          { createdAt: recentDate(), status: 'paid', total: '100' },
          { createdAt: recentDate(), status: 'paid', total: '50' },
        ]),
      );
      const r = await service.getAverageCart('month');
      expect(r.averageCartValue).toBe(75);
      expect(r.totalOrders).toBe(2);
    });

    it('returns 0 when no orders', async () => {
      orderClient.send.mockReturnValue(of([]));
      const r = await service.getAverageCart('month');
      expect(r.averageCartValue).toBe(0);
    });

    it('returns cached value', async () => {
      repo.findOne.mockResolvedValueOnce({
        metricValue: { period: 'month', averageCartValue: 50, totalOrders: 1, totalRevenue: 50 },
      });
      const r = await service.getAverageCart('month');
      expect(r.averageCartValue).toBe(50);
    });
  });

  describe('getAverageCartByProductType', () => {
    it('returns supported types with zeroes when no data', async () => {
      orderClient.send.mockReturnValue(of([]));
      catalogClient.send.mockReturnValue(of({ data: [] }));
      const r = await service.getAverageCartByProductType('month');
      expect(r.data.map((d) => d.productType)).toEqual(['saas', 'physical', 'license']);
      expect(r.data.every((d) => d.averageCartValue === 0)).toBe(true);
    });

    it('aggregates by normalized product type', async () => {
      orderClient.send.mockReturnValue(
        of([
          {
            createdAt: recentDate(),
            status: 'paid',
            total: '100',
            items: [
              { productId: 'p1', unitPrice: '100', quantity: 1 },
              { productId: 'p2', unitPrice: '20', quantity: 1 },
            ],
          },
        ]),
      );
      catalogClient.send.mockReturnValue(
        of({
          data: [
            { id: 'p1', productType: 'SaaS' },
            { id: 'p2', productType: 'hardware' },
          ],
        }),
      );
      const r = await service.getAverageCartByProductType('month');
      const saas = r.data.find((d) => d.productType === 'saas');
      const physical = r.data.find((d) => d.productType === 'physical');
      // TTC: HT × 1.2 (HT 100 → 120, HT 20 → 24)
      expect(saas?.averageCartValue).toBe(120);
      expect(physical?.averageCartValue).toBe(24);
    });

    it('skips unknown product types', async () => {
      orderClient.send.mockReturnValue(
        of([
          {
            createdAt: recentDate(),
            status: 'paid',
            total: '100',
            items: [{ productId: 'p1', unitPrice: '100', quantity: 1 }],
          },
        ]),
      );
      catalogClient.send.mockReturnValue(of({ data: [{ id: 'p1', productType: 'mystery' }] }));
      const r = await service.getAverageCartByProductType('month');
      expect(r.data.every((d) => d.averageCartValue === 0)).toBe(true);
    });

    it('returns cached value', async () => {
      repo.findOne.mockResolvedValueOnce({ metricValue: { period: 'month', data: [] } });
      const r = await service.getAverageCartByProductType('month');
      expect(r.data).toEqual([]);
    });

    it('normalizes license/licence/digital and subscription aliases', async () => {
      orderClient.send.mockReturnValue(
        of([
          {
            createdAt: recentDate(),
            status: 'paid',
            total: '100',
            items: [
              { productId: 'p1', unitPrice: '10', quantity: 1 },
              { productId: 'p2', unitPrice: '20', quantity: 1 },
              { productId: 'p3', unitPrice: '30', quantity: 1 },
              { productId: 'p4', unitPrice: '40', quantity: 1 },
            ],
          },
        ]),
      );
      catalogClient.send.mockReturnValue(
        of({
          data: [
            { id: 'p1', productType: 'subscription' },
            { id: 'p2', productType: 'licence' },
            { id: 'p3', productType: 'digital' },
            { id: 'p4', productType: 'license' },
          ],
        }),
      );
      const r = await service.getAverageCartByProductType('month');
      // TTC: HT × 1.2 (HT 10 → 12, HT (20+30+40)=90 → 108)
      expect(r.data.find((d) => d.productType === 'saas')?.averageCartValue).toBe(12);
      expect(r.data.find((d) => d.productType === 'license')?.averageCartValue).toBe(108);
    });
  });

  describe('getMrr', () => {
    it('returns cached when present', async () => {
      repo.findOne.mockResolvedValueOnce({
        metricValue: {
          currentMrr: 100,
          history: [],
          growth: { monthOverMonth: 0, yearOverYear: 0 },
        },
      });
      const r = await service.getMrr();
      expect(r.currentMrr).toBe(100);
    });

    it('computes MRR with monthly and yearly subscriptions', async () => {
      paymentClient.send.mockReturnValue(
        of([
          { status: 'active', createdAt: '2020-01-01', price: '20', billingPeriod: 'monthly' },
          { status: 'active', createdAt: '2020-01-01', price: '120', billingPeriod: 'yearly' },
          { status: 'cancelled', createdAt: '2020-01-01', price: '10', cancelledAt: '2020-02-01' },
        ]),
      );
      const r = await service.getMrr();
      // MRR TTC: (20 + 120/12) × 1.2 = 36
      expect(r.currentMrr).toBe(36);
      expect(r.history.length).toBe(12);
    });

    it('returns 0 MRR with no subscriptions', async () => {
      paymentClient.send.mockReturnValue(of([]));
      const r = await service.getMrr();
      expect(r.currentMrr).toBe(0);
    });

    it('falls back to empty list on payment fetch error', async () => {
      paymentClient.send.mockReturnValue(throwError(() => new Error('down')));
      const r = await service.getMrr();
      expect(r.currentMrr).toBe(0);
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe('getStockStatus', () => {
    it('computes summary and product list', async () => {
      catalogClient.send.mockImplementation((pattern: { cmd: string }) => {
        if (pattern.cmd.includes('STOCK_GET_ALERTS') || pattern.cmd.includes('stock')) {
          return of([
            {
              productId: 'p1',
              name: 'Product1',
              stockQuantity: 0,
              stockAlertThreshold: 5,
            },
          ]);
        }
        return of({
          data: [
            { id: 'p1', productType: 'physical', stockQuantity: 0 },
            { id: 'p2', productType: 'physical', stockQuantity: 100 },
            { id: 'p3', productType: 'saas' },
          ],
        });
      });
      const r = await service.getStockStatus();
      expect(r.summary.totalProducts).toBe(2);
      expect(r.summary.outOfStock).toBeGreaterThanOrEqual(1);
    });

    it('returns cached', async () => {
      repo.findOne.mockResolvedValueOnce({
        metricValue: {
          summary: { totalProducts: 0, inStock: 0, lowStock: 0, outOfStock: 0 },
          products: [],
        },
      });
      const r = await service.getStockStatus();
      expect(r.summary.totalProducts).toBe(0);
    });

    it('handles alerts and products fetch errors', async () => {
      catalogClient.send.mockReturnValue(throwError(() => new Error('catalog down')));
      const r = await service.getStockStatus();
      expect(r.summary.totalProducts).toBe(0);
      expect(logger.warn).toHaveBeenCalled();
    });

    it('accepts alerts as non-array (falls back to empty)', async () => {
      catalogClient.send.mockImplementation((pattern: { cmd: string }) => {
        if (pattern.cmd.includes('stock')) return of({ notArray: true });
        return of({ data: [] });
      });
      const r = await service.getStockStatus();
      expect(r.products).toEqual([]);
    });
  });
});
