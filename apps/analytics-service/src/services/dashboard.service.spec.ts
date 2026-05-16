import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { of, throwError } from 'rxjs';
import { CynaLoggerService, SERVICE_NAMES } from '@cyna-api/common';
import { DashboardService } from './dashboard.service';
import { AnalyticsCache } from '../entities';

describe('DashboardService', () => {
  let service: DashboardService;
  let orderClient: { send: jest.Mock };
  let paymentClient: { send: jest.Mock };
  let catalogClient: { send: jest.Mock };
  let repo: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let logger: { log: jest.Mock; warn: jest.Mock; debug: jest.Mock };
  let configService: { get: jest.Mock };

  beforeEach(async () => {
    orderClient = { send: jest.fn().mockReturnValue(of([])) };
    paymentClient = { send: jest.fn().mockReturnValue(of([])) };
    catalogClient = { send: jest.fn().mockReturnValue(of([])) };
    repo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((dto) => dto),
      save: jest.fn(),
    };
    logger = { log: jest.fn(), warn: jest.fn(), debug: jest.fn() };
    configService = { get: jest.fn().mockReturnValue(300) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DashboardService,
        { provide: SERVICE_NAMES.ORDER, useValue: orderClient },
        { provide: SERVICE_NAMES.PAYMENT, useValue: paymentClient },
        { provide: SERVICE_NAMES.CATALOG, useValue: catalogClient },
        { provide: getRepositoryToken(AnalyticsCache), useValue: repo },
        { provide: CynaLoggerService, useValue: logger },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();
    service = module.get(DashboardService);
  });

  describe('getDateRange', () => {
    it.each(['today', 'week', 'month', 'quarter', 'year'])('returns range for %s', (period) => {
      const r = service.getDateRange(period);
      expect(r.start).toBeInstanceOf(Date);
      expect(r.end).toBeInstanceOf(Date);
      expect(r.prevStart).toBeInstanceOf(Date);
      expect(r.prevEnd).toBeInstanceOf(Date);
    });

    it('defaults to month for unknown period', () => {
      const r = service.getDateRange('xxx');
      expect(r.start).toBeInstanceOf(Date);
    });
  });

  describe('getDashboard', () => {
    it('returns cached value when present', async () => {
      const cached = { revenue: { total: 100 } };
      repo.findOne.mockResolvedValueOnce({ metricValue: cached });
      const r = await service.getDashboard('month');
      expect(r).toEqual(cached);
    });

    it('computes dashboard from orders and subscriptions', async () => {
      repo.findOne.mockResolvedValue(null);
      const now = new Date();
      const recent = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 5)).toISOString();
      orderClient.send.mockReturnValue(
        of([
          {
            createdAt: recent,
            status: 'paid',
            total: '100',
            orderType: 'subscription',
          },
          { createdAt: recent, status: 'paid', total: '50', orderType: 'one-time' },
          { createdAt: recent, status: 'pending', total: '20' },
          { createdAt: recent, status: 'cancelled', total: '0' },
        ]),
      );
      paymentClient.send.mockReturnValue(
        of([
          {
            status: 'active',
            createdAt: recent,
            price: '20',
            billingPeriod: 'monthly',
          },
          {
            status: 'active',
            createdAt: recent,
            price: '120',
            billingPeriod: 'yearly',
          },
          {
            status: 'cancelled',
            createdAt: recent,
            cancelledAt: recent,
            price: '10',
          },
        ]),
      );
      const r = await service.getDashboard('month');
      expect(r.revenue.total).toBe(150);
      expect(r.revenue.recurring).toBe(100);
      expect(r.revenue.oneTime).toBe(50);
      expect(r.orders.completed).toBe(2);
      expect(r.orders.pending).toBe(1);
      expect(r.orders.cancelled).toBe(1);
      expect(r.subscriptions.active).toBe(2);
      // MRR is TTC: (20 + 120/12) * 1.2 = 36
      expect(r.subscriptions.mrr).toBe(36);
    });

    it('handles paginated envelopes and rejected promises', async () => {
      repo.findOne.mockResolvedValue(null);
      orderClient.send.mockReturnValue(of({ data: [] }));
      paymentClient.send.mockReturnValue(throwError(() => new Error('payment down')));
      const r = await service.getDashboard('month');
      expect(r.revenue.total).toBe(0);
      expect(logger.warn).toHaveBeenCalled();
    });

    it('handles array subscription envelope and rejected orders', async () => {
      repo.findOne.mockResolvedValue(null);
      orderClient.send.mockReturnValue(throwError(() => new Error('orders down')));
      paymentClient.send.mockReturnValue(of({ data: [] }));
      const r = await service.getDashboard('month');
      expect(r.orders.total).toBe(0);
    });

    it('writes cache after computing', async () => {
      repo.findOne.mockResolvedValue(null);
      await service.getDashboard('month');
      expect(repo.save).toHaveBeenCalled();
    });

    it('updates existing cache entry instead of creating', async () => {
      repo.findOne
        .mockResolvedValueOnce(null) // initial read
        .mockResolvedValueOnce({ metricKey: 'dashboard:month' }); // setCachedMetric existing
      await service.getDashboard('month');
      expect(repo.save).toHaveBeenCalled();
    });

    it('survives cache read errors', async () => {
      repo.findOne.mockRejectedValueOnce(new Error('db down'));
      orderClient.send.mockReturnValue(of([]));
      paymentClient.send.mockReturnValue(of([]));
      const r = await service.getDashboard('month');
      expect(r).toBeDefined();
      expect(logger.warn).toHaveBeenCalled();
    });

    it('survives cache write errors', async () => {
      repo.findOne.mockResolvedValueOnce(null);
      repo.findOne.mockRejectedValueOnce(new Error('write fail'));
      orderClient.send.mockReturnValue(of([]));
      paymentClient.send.mockReturnValue(of([]));
      await service.getDashboard('month');
      expect(logger.warn).toHaveBeenCalled();
    });
  });
});
