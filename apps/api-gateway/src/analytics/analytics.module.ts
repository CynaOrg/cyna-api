import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AnalyticsAdminController } from './analytics-admin.controller';
import { AnalyticsService } from './analytics.service';

@Module({
  imports: [ConfigModule],
  controllers: [AnalyticsAdminController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
