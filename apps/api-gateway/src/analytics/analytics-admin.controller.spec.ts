import { Test, TestingModule } from '@nestjs/testing';
import { of } from 'rxjs';
import { SERVICE_NAMES, MESSAGE_PATTERNS } from '@cyna-api/common';
import { AnalyticsAdminController } from './analytics-admin.controller';
import { AnalyticsService } from './analytics.service';
import { AdminRolesGuard } from '../auth/guards';
import type { Response } from 'express';

const buildRes = (): Response => {
  const res: Partial<Response> = {};
  res.setHeader = jest.fn().mockReturnValue(res) as unknown as Response['setHeader'];
  res.send = jest.fn().mockReturnValue(res) as unknown as Response['send'];
  return res as Response;
};

describe('AnalyticsAdminController', () => {
  let controller: AnalyticsAdminController;
  let client: { send: jest.Mock };

  beforeEach(async () => {
    client = { send: jest.fn().mockReturnValue(of({})) };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnalyticsAdminController],
      providers: [AnalyticsService, { provide: SERVICE_NAMES.ANALYTICS, useValue: client }],
    })
      .overrideGuard(AdminRolesGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(AnalyticsAdminController);
  });

  it('GET /dashboard forwards query', async () => {
    await controller.getDashboard({ period: 'month' } as never);
    expect(client.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.ANALYTICS.GET_DASHBOARD, {
      period: 'month',
    });
  });

  it('GET /sales forwards query', async () => {
    await controller.getSales({} as never);
    expect(client.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.ANALYTICS.GET_SALES, {});
  });

  it('GET /sales-by-category', async () => {
    await controller.getSalesByCategory({} as never);
    expect(client.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.ANALYTICS.GET_SALES_BY_CATEGORY, {});
  });

  it('GET /sales-by-product-type', async () => {
    await controller.getSalesByProductType({} as never);
    expect(client.send).toHaveBeenCalledWith(
      MESSAGE_PATTERNS.ANALYTICS.GET_SALES_BY_PRODUCT_TYPE,
      {},
    );
  });

  it('GET /average-cart', async () => {
    await controller.getAverageCart({} as never);
    expect(client.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.ANALYTICS.GET_AVERAGE_CART, {});
  });

  it('GET /average-cart-by-product-type', async () => {
    await controller.getAverageCartByProductType({} as never);
    expect(client.send).toHaveBeenCalledWith(
      MESSAGE_PATTERNS.ANALYTICS.GET_AVERAGE_CART_BY_PRODUCT_TYPE,
      {},
    );
  });

  it('GET /mrr forwards query', async () => {
    await controller.getMrr({} as never);
    expect(client.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.ANALYTICS.GET_MRR, {});
  });

  it('GET /stock returns stock status', async () => {
    await controller.getStockStatus();
    expect(client.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.ANALYTICS.GET_STOCK_STATUS, {});
  });

  it('GET /export/sales sends CSV with content-type and filename', async () => {
    client.send.mockReturnValueOnce(of({ csv: 'col1,col2\n1,2' }));
    const res = buildRes();
    await controller.exportSales({} as never, res);
    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv');
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringContaining('sales-export'),
    );
    expect(res.send).toHaveBeenCalledWith('col1,col2\n1,2');
  });

  it('GET /export/sales falls back to .data field', async () => {
    client.send.mockReturnValueOnce(of({ data: 'a,b' }));
    const res = buildRes();
    await controller.exportSales({} as never, res);
    expect(res.send).toHaveBeenCalledWith('a,b');
  });

  it('GET /export/sales sends empty string when no csv/data', async () => {
    client.send.mockReturnValueOnce(of({}));
    const res = buildRes();
    await controller.exportSales({} as never, res);
    expect(res.send).toHaveBeenCalledWith('');
  });

  it('GET /export/orders sends CSV', async () => {
    client.send.mockReturnValueOnce(of({ csv: 'o1' }));
    const res = buildRes();
    await controller.exportOrders({} as never, res);
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringContaining('orders-export'),
    );
    expect(res.send).toHaveBeenCalledWith('o1');
  });

  it('GET /export/subscriptions sends CSV', async () => {
    client.send.mockReturnValueOnce(of({ csv: 's1' }));
    const res = buildRes();
    await controller.exportSubscriptions({} as never, res);
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringContaining('subscriptions-export'),
    );
    expect(res.send).toHaveBeenCalledWith('s1');
  });
});
