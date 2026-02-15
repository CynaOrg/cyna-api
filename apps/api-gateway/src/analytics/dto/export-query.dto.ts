import { IsOptional, IsString, IsEnum } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ExportQueryDto {
  @ApiPropertyOptional({ description: 'Start date (ISO 8601)', example: '2024-01-01' })
  @IsOptional()
  @IsString()
  dateFrom?: string;

  @ApiPropertyOptional({ description: 'End date (ISO 8601)', example: '2024-12-31' })
  @IsOptional()
  @IsString()
  dateTo?: string;

  @ApiPropertyOptional({ description: 'Export format', enum: ['csv', 'xlsx'], default: 'csv' })
  @IsOptional()
  @IsEnum(['csv', 'xlsx'])
  format?: string;
}
