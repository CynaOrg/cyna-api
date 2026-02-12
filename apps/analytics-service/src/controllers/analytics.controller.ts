import { Controller } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { MESSAGE_PATTERNS } from '@cyna-api/common';
import { DashboardService, SalesService, ExportService } from '../services';
import { DashboardQueryDto, SalesQueryDto, ExportQueryDto } from '../dto';

@Controller()
export class AnalyticsController {
  constructor(
    private readonly dashboardService: DashboardService,
    private readonly salesService: SalesService,
    private readonly exportService: ExportService,
  ) {}

  // ==================== Dashboard ====================

  @MessagePattern(MESSAGE_PATTERNS.ANALYTICS.GET_DASHBOARD)
  async getDashboard(@Payload() data: DashboardQueryDto) {
    return this.dashboardService.getDashboard(data.period);
  }

  // ==================== Sales ====================

  @MessagePattern(MESSAGE_PATTERNS.ANALYTICS.GET_SALES)
  async getSales(@Payload() data: SalesQueryDto) {
    return this.salesService.getSales(data.period, data.groupBy);
  }

  @MessagePattern(MESSAGE_PATTERNS.ANALYTICS.GET_SALES_BY_CATEGORY)
  async getSalesByCategory(@Payload() data: SalesQueryDto) {
    return this.salesService.getSalesByCategory(data.period);
  }

  @MessagePattern(MESSAGE_PATTERNS.ANALYTICS.GET_SALES_BY_PRODUCT_TYPE)
  async getSalesByProductType(@Payload() data: SalesQueryDto) {
    return this.salesService.getSalesByProductType(data.period);
  }

  @MessagePattern(MESSAGE_PATTERNS.ANALYTICS.GET_AVERAGE_CART)
  async getAverageCart(@Payload() data: SalesQueryDto) {
    return this.salesService.getAverageCart(data.period);
  }

  @MessagePattern(MESSAGE_PATTERNS.ANALYTICS.GET_MRR)
  async getMrr() {
    return this.salesService.getMrr();
  }

  @MessagePattern(MESSAGE_PATTERNS.ANALYTICS.GET_STOCK_STATUS)
  async getStockStatus() {
    return this.salesService.getStockStatus();
  }

  // ==================== Exports ====================

  @MessagePattern(MESSAGE_PATTERNS.ANALYTICS.EXPORT_SALES)
  async exportSales(@Payload() data: ExportQueryDto) {
    return this.exportService.exportSales(data.dateFrom, data.dateTo, data.format || 'csv');
  }

  @MessagePattern(MESSAGE_PATTERNS.ANALYTICS.EXPORT_ORDERS)
  async exportOrders(@Payload() data: ExportQueryDto) {
    return this.exportService.exportOrders(data.dateFrom, data.dateTo, data.format || 'csv');
  }

  @MessagePattern(MESSAGE_PATTERNS.ANALYTICS.EXPORT_SUBSCRIPTIONS)
  async exportSubscriptions(@Payload() data: ExportQueryDto) {
    return this.exportService.exportSubscriptions(data.dateFrom, data.dateTo, data.format || 'csv');
  }
}
