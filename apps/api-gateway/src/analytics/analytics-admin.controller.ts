import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Response } from 'express';
import { AdminRole } from '@cyna-api/common';
import { AnalyticsService } from './analytics.service';
import { AdminRolesGuard } from '../auth/guards';
import { AdminRoles } from '../auth/decorators';
import { AnalyticsQueryDto, ExportQueryDto } from './dto';

@ApiTags('Admin - Analytics')
@Controller('admin/analytics')
@UseGuards(AdminRolesGuard)
@AdminRoles(AdminRole.SUPER_ADMIN, AdminRole.COMMERCIAL)
@ApiBearerAuth('JWT-auth')
export class AnalyticsAdminController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  // ==================== Dashboard ====================

  @Get('dashboard')
  @ApiOperation({ summary: 'Get dashboard KPIs (revenue, orders, subscriptions, MRR, avg cart)' })
  @ApiResponse({ status: 200, description: 'Dashboard KPIs with variations' })
  async getDashboard(@Query() query: AnalyticsQueryDto) {
    return this.analyticsService.getDashboard(query);
  }

  // ==================== Sales ====================

  @Get('sales')
  @ApiOperation({ summary: 'Get sales history (grouped by day/week/month)' })
  @ApiResponse({ status: 200, description: 'Sales history data' })
  async getSales(@Query() query: AnalyticsQueryDto) {
    return this.analyticsService.getSales(query);
  }

  @Get('sales-by-category')
  @ApiOperation({ summary: 'Get sales breakdown by category' })
  @ApiResponse({ status: 200, description: 'Sales by category' })
  async getSalesByCategory(@Query() query: AnalyticsQueryDto) {
    return this.analyticsService.getSalesByCategory(query);
  }

  @Get('sales-by-product-type')
  @ApiOperation({ summary: 'Get sales breakdown by product type (SaaS, Digital, Physical)' })
  @ApiResponse({ status: 200, description: 'Sales by product type' })
  async getSalesByProductType(@Query() query: AnalyticsQueryDto) {
    return this.analyticsService.getSalesByProductType(query);
  }

  @Get('average-cart')
  @ApiOperation({ summary: 'Get average cart value over time' })
  @ApiResponse({ status: 200, description: 'Average cart data' })
  async getAverageCart(@Query() query: AnalyticsQueryDto) {
    return this.analyticsService.getAverageCart(query);
  }

  @Get('average-cart-by-product-type')
  @ApiOperation({
    summary: 'Get average cart value grouped by product type (SaaS, Physical, License)',
  })
  @ApiResponse({ status: 200, description: 'Average cart by product type' })
  async getAverageCartByProductType(@Query() query: AnalyticsQueryDto) {
    return this.analyticsService.getAverageCartByProductType(query);
  }

  // ==================== MRR ====================

  @Get('mrr')
  @ApiOperation({ summary: 'Get MRR history and trends' })
  @ApiResponse({ status: 200, description: 'MRR evolution data' })
  async getMrr(@Query() query: AnalyticsQueryDto) {
    return this.analyticsService.getMrr(query);
  }

  // ==================== Stock ====================

  @Get('stock')
  @ApiOperation({ summary: 'Get stock status overview' })
  @ApiResponse({ status: 200, description: 'Stock status for all physical products' })
  async getStockStatus() {
    return this.analyticsService.getStockStatus();
  }

  // ==================== Exports ====================

  @Get('export/sales')
  @ApiOperation({ summary: 'Export sales data as CSV' })
  @ApiResponse({ status: 200, description: 'CSV file' })
  async exportSales(@Query() query: ExportQueryDto, @Res() res: Response) {
    const result = await this.analyticsService.exportSales(query);
    const csv =
      (result as Record<string, unknown>)?.csv || (result as Record<string, unknown>)?.data || '';
    const filename = `sales-export-${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }

  @Get('export/orders')
  @ApiOperation({ summary: 'Export orders data as CSV' })
  @ApiResponse({ status: 200, description: 'CSV file' })
  async exportOrders(@Query() query: ExportQueryDto, @Res() res: Response) {
    const result = await this.analyticsService.exportOrders(query);
    const csv =
      (result as Record<string, unknown>)?.csv || (result as Record<string, unknown>)?.data || '';
    const filename = `orders-export-${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }

  @Get('export/subscriptions')
  @ApiOperation({ summary: 'Export subscriptions data as CSV' })
  @ApiResponse({ status: 200, description: 'CSV file' })
  async exportSubscriptions(@Query() query: ExportQueryDto, @Res() res: Response) {
    const result = await this.analyticsService.exportSubscriptions(query);
    const csv =
      (result as Record<string, unknown>)?.csv || (result as Record<string, unknown>)?.data || '';
    const filename = `subscriptions-export-${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  }
}
