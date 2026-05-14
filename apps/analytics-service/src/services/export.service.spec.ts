import { Test, TestingModule } from '@nestjs/testing';
import { of, throwError } from 'rxjs';
import { CynaLoggerService, SERVICE_NAMES } from '@cyna-api/common';
import { ExportService } from './export.service';

describe('ExportService', () => {
  let service: ExportService;
  let orderClient: { send: jest.Mock };
  let paymentClient: { send: jest.Mock };
  let logger: { log: jest.Mock; warn: jest.Mock; error: jest.Mock };

  beforeEach(async () => {
    orderClient = { send: jest.fn() };
    paymentClient = { send: jest.fn() };
    logger = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExportService,
        { provide: SERVICE_NAMES.ORDER, useValue: orderClient },
        { provide: SERVICE_NAMES.PAYMENT, useValue: paymentClient },
        { provide: CynaLoggerService, useValue: logger },
      ],
    }).compile();
    service = module.get(ExportService);
  });

  describe('exportSales', () => {
    it('builds CSV with paid orders in range', async () => {
      orderClient.send.mockReturnValue(
        of([
          {
            id: 'o1',
            createdAt: '2024-06-15T10:00:00Z',
            status: 'paid',
            total: '100.5',
            customerEmail: 'a@x',
          },
          {
            id: 'o2',
            createdAt: '2024-06-20T10:00:00Z',
            status: 'pending',
            total: '50',
          },
        ]),
      );
      const r = await service.exportSales('2024-06-01', '2024-06-30', 'csv');
      expect(r.contentType).toBe('text/csv');
      expect(r.filename).toBe('sales_2024-06.csv');
      expect(r.data).toContain('Order ID');
      expect(r.data).toContain('o1');
      expect(r.data).not.toContain('o2');
    });

    it('uses multi-month filename when range spans months', async () => {
      orderClient.send.mockReturnValue(of([]));
      const r = await service.exportSales('2024-01-01', '2024-03-31', 'csv');
      expect(r.filename).toBe('sales_2024-01_to_2024-03.csv');
    });

    it('handles paginated order response', async () => {
      orderClient.send.mockReturnValue(of({ data: [] }));
      const r = await service.exportSales('2024-01-01', '2024-01-31', 'csv');
      expect(r.data).toContain('Order ID');
    });

    it('falls back to orderNumber/userId when id/customerEmail missing', async () => {
      orderClient.send.mockReturnValue(
        of([
          {
            orderNumber: 'ORD-1',
            userId: 'u1',
            createdAt: '2024-06-15T10:00:00Z',
            status: 'completed',
            total: '50',
          },
        ]),
      );
      const r = await service.exportSales('2024-06-01', '2024-06-30', 'csv');
      expect(r.data).toContain('ORD-1');
      expect(r.data).toContain('u1');
    });

    it('rethrows when orders fetch fails', async () => {
      orderClient.send.mockReturnValue(throwError(() => new Error('orders down')));
      await expect(service.exportSales('2024-06-01', '2024-06-30', 'csv')).rejects.toThrow();
    });
  });

  describe('exportOrders', () => {
    it('builds CSV with all orders', async () => {
      orderClient.send.mockReturnValue(
        of([
          {
            id: 'o1',
            createdAt: '2024-06-15T10:00:00Z',
            status: 'paid',
            subtotal: '100',
            taxAmount: '20',
            total: '120',
            paymentStatus: 'succeeded',
            items: [{ productId: 'p1', quantity: 1 }],
          },
        ]),
      );
      const r = await service.exportOrders('2024-06-01', '2024-06-30', 'csv');
      expect(r.filename).toBe('orders_2024-06.csv');
      expect(r.data).toContain('o1');
      expect(r.data).toContain('Items Count');
    });

    it('handles missing items', async () => {
      orderClient.send.mockReturnValue(
        of([
          {
            id: 'o1',
            createdAt: '2024-06-15T10:00:00Z',
            status: 'paid',
          },
        ]),
      );
      const r = await service.exportOrders('2024-06-01', '2024-06-30', 'csv');
      expect(r.data).toContain('o1');
    });

    it('uses multi-month filename', async () => {
      orderClient.send.mockReturnValue(of([]));
      const r = await service.exportOrders('2024-01-01', '2024-03-31', 'csv');
      expect(r.filename).toBe('orders_2024-01_to_2024-03.csv');
    });
  });

  describe('exportSubscriptions', () => {
    it('builds CSV with subscriptions in range', async () => {
      paymentClient.send.mockReturnValue(
        of([
          {
            id: 's1',
            createdAt: '2024-06-15T10:00:00Z',
            customerEmail: 'a@x',
            productName: 'SaaS Pro',
            price: '20',
            billingPeriod: 'monthly',
            status: 'active',
          },
        ]),
      );
      const r = await service.exportSubscriptions('2024-06-01', '2024-06-30', 'csv');
      expect(r.filename).toBe('subscriptions_2024-06.csv');
      expect(r.data).toContain('s1');
    });

    it('handles paginated subscriptions response', async () => {
      paymentClient.send.mockReturnValue(of({ data: [] }));
      const r = await service.exportSubscriptions('2024-06-01', '2024-06-30', 'csv');
      expect(r.data).toContain('Subscription ID');
    });

    it('falls back to subscriptionId/userId/planName', async () => {
      paymentClient.send.mockReturnValue(
        of([
          {
            subscriptionId: 'sub_x',
            userId: 'u1',
            planName: 'Plan',
            createdAt: '2024-06-15T10:00:00Z',
            price: '20',
            status: 'active',
          },
        ]),
      );
      const r = await service.exportSubscriptions('2024-06-01', '2024-06-30', 'csv');
      expect(r.data).toContain('sub_x');
      expect(r.data).toContain('u1');
      expect(r.data).toContain('Plan');
    });

    it('uses multi-month filename', async () => {
      paymentClient.send.mockReturnValue(of([]));
      const r = await service.exportSubscriptions('2024-01-01', '2024-03-31', 'csv');
      expect(r.filename).toBe('subscriptions_2024-01_to_2024-03.csv');
    });

    it('rethrows when subscriptions fetch fails', async () => {
      paymentClient.send.mockReturnValue(throwError(() => new Error('payment down')));
      await expect(
        service.exportSubscriptions('2024-06-01', '2024-06-30', 'csv'),
      ).rejects.toThrow();
    });
  });
});
