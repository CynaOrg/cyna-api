import { IsOptional, IsEnum, IsDateString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class AnalyticsQueryDto {
  @ApiPropertyOptional({
    description: 'Period for dashboard/sales data',
    enum: ['today', 'week', 'month', 'quarter', 'year'],
    default: 'month',
  })
  @IsOptional()
  @IsEnum(['today', 'week', 'month', 'quarter', 'year'], {
    message: 'period must be one of: today, week, month, quarter, year',
  })
  period?: string;

  @ApiPropertyOptional({
    description: 'Group by period for sales data',
    enum: ['day', 'week', 'month'],
    default: 'day',
  })
  @IsOptional()
  @IsEnum(['day', 'week', 'month'], { message: 'groupBy must be one of: day, week, month' })
  groupBy?: string;

  @ApiPropertyOptional({ description: 'Start date (ISO 8601)', example: '2024-01-01' })
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'End date (ISO 8601)', example: '2024-12-31' })
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
