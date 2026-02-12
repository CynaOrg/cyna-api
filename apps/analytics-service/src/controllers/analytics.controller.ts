import { Controller } from '@nestjs/common';
import { MessagePattern, Payload, Ctx, RmqContext } from '@nestjs/microservices';
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
  async getDashboard(@Payload() data: DashboardQueryDto, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.dashboardService.getDashboard(data.period);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  // ==================== Sales ====================

  @MessagePattern(MESSAGE_PATTERNS.ANALYTICS.GET_SALES)
  async getSales(@Payload() data: SalesQueryDto, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.salesService.getSales(data.period, data.groupBy);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.ANALYTICS.GET_SALES_BY_CATEGORY)
  async getSalesByCategory(@Payload() data: SalesQueryDto, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.salesService.getSalesByCategory(data.period);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.ANALYTICS.GET_SALES_BY_PRODUCT_TYPE)
  async getSalesByProductType(@Payload() data: SalesQueryDto, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.salesService.getSalesByProductType(data.period);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.ANALYTICS.GET_AVERAGE_CART)
  async getAverageCart(@Payload() data: SalesQueryDto, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.salesService.getAverageCart(data.period);
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.ANALYTICS.GET_MRR)
  async getMrr(@Payload() data: any, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.salesService.getMrr();
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.ANALYTICS.GET_STOCK_STATUS)
  async getStockStatus(@Payload() data: any, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.salesService.getStockStatus();
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  // ==================== Exports ====================

  @MessagePattern(MESSAGE_PATTERNS.ANALYTICS.EXPORT_SALES)
  async exportSales(@Payload() data: ExportQueryDto, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.exportService.exportSales(
        data.dateFrom,
        data.dateTo,
        data.format || 'csv',
      );
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.ANALYTICS.EXPORT_ORDERS)
  async exportOrders(@Payload() data: ExportQueryDto, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.exportService.exportOrders(
        data.dateFrom,
        data.dateTo,
        data.format || 'csv',
      );
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }

  @MessagePattern(MESSAGE_PATTERNS.ANALYTICS.EXPORT_SUBSCRIPTIONS)
  async exportSubscriptions(@Payload() data: ExportQueryDto, @Ctx() context: RmqContext) {
    const channel = context.getChannelRef();
    const originalMsg = context.getMessage();

    try {
      const result = await this.exportService.exportSubscriptions(
        data.dateFrom,
        data.dateTo,
        data.format || 'csv',
      );
      channel.ack(originalMsg);
      return result;
    } catch (error) {
      channel.ack(originalMsg);
      throw error;
    }
  }
}
