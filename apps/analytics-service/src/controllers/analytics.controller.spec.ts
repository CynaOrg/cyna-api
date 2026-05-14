import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsController } from './analytics.controller';
import { DashboardService, SalesService, ExportService } from '../services';

describe('AnalyticsController', () => {
  let controller: AnalyticsController;
  let dashboardService: jest.Mocked<DashboardService>;
  let salesService: jest.Mocked<SalesService>;
  let exportService: jest.Mocked<ExportService>;

  beforeEach(async () => {
    dashboardService = { getDashboard: jest.fn() } as unknown as jest.Mocked<DashboardService>;
    salesService = {
      getSales: jest.fn(),
      getSalesByCategory: jest.fn(),
      getSalesByProductType: jest.fn(),
      getAverageCart: jest.fn(),
      getAverageCartByProductType: jest.fn(),
      getMrr: jest.fn(),
      getStockStatus: jest.fn(),
    } as unknown as jest.Mocked<SalesService>;
    exportService = {
      exportSales: jest.fn(),
      exportOrders: jest.fn(),
      exportSubscriptions: jest.fn(),
    } as unknown as jest.Mocked<ExportService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnalyticsController],
      providers: [
        { provide: DashboardService, useValue: dashboardService },
        { provide: SalesService, useValue: salesService },
        { provide: ExportService, useValue: exportService },
      ],
    }).compile();
    controller = module.get(AnalyticsController);
  });

  it('getDashboard delegates', async () => {
    await controller.getDashboard({ period: 'month' } as never);
    expect(dashboardService.getDashboard).toHaveBeenCalledWith('month');
  });

  it('getSales forwards period and groupBy', async () => {
    await controller.getSales({ period: 'week', groupBy: 'day' } as never);
    expect(salesService.getSales).toHaveBeenCalledWith('week', 'day');
  });

  it('getSalesByCategory delegates', async () => {
    await controller.getSalesByCategory({ period: 'month' } as never);
    expect(salesService.getSalesByCategory).toHaveBeenCalledWith('month');
  });

  it('getSalesByProductType delegates', async () => {
    await controller.getSalesByProductType({ period: 'year' } as never);
    expect(salesService.getSalesByProductType).toHaveBeenCalledWith('year');
  });

  it('getAverageCart delegates', async () => {
    await controller.getAverageCart({ period: 'month' } as never);
    expect(salesService.getAverageCart).toHaveBeenCalledWith('month');
  });

  it('getAverageCartByProductType delegates', async () => {
    await controller.getAverageCartByProductType({ period: 'month' } as never);
    expect(salesService.getAverageCartByProductType).toHaveBeenCalledWith('month');
  });

  it('getMrr delegates', async () => {
    await controller.getMrr();
    expect(salesService.getMrr).toHaveBeenCalled();
  });

  it('getStockStatus delegates', async () => {
    await controller.getStockStatus();
    expect(salesService.getStockStatus).toHaveBeenCalled();
  });

  it.each([
    ['exportSales', 'exportSales'],
    ['exportOrders', 'exportOrders'],
    ['exportSubscriptions', 'exportSubscriptions'],
  ])('%s delegates with date range and format', async (method, target) => {
    await (controller as unknown as Record<string, (d: unknown) => Promise<unknown>>)[method]({
      dateFrom: '2024-01-01',
      dateTo: '2024-12-31',
      format: 'csv',
    });
    expect((exportService as unknown as Record<string, jest.Mock>)[target]).toHaveBeenCalledWith(
      '2024-01-01',
      '2024-12-31',
      'csv',
    );
  });

  it('exportSales defaults format to csv', async () => {
    await controller.exportSales({ dateFrom: 'a', dateTo: 'b' } as never);
    expect(exportService.exportSales).toHaveBeenCalledWith('a', 'b', 'csv');
  });

  it('exportOrders defaults format to csv', async () => {
    await controller.exportOrders({ dateFrom: 'a', dateTo: 'b' } as never);
    expect(exportService.exportOrders).toHaveBeenCalledWith('a', 'b', 'csv');
  });

  it('exportSubscriptions defaults format to csv', async () => {
    await controller.exportSubscriptions({ dateFrom: 'a', dateTo: 'b' } as never);
    expect(exportService.exportSubscriptions).toHaveBeenCalledWith('a', 'b', 'csv');
  });
});
