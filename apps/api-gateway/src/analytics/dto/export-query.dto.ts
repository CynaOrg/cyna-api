import { IsString, IsEnum, IsOptional, IsNotEmpty, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ExportQueryDto {
  @ApiProperty({ description: 'Start date (ISO 8601)', example: '2024-01-01' })
  @IsString()
  @IsNotEmpty({ message: 'dateFrom is required (ISO 8601, e.g. 2024-01-01)' })
  @IsDateString({}, { message: 'dateFrom must be a valid ISO 8601 date string' })
  dateFrom: string;

  @ApiProperty({ description: 'End date (ISO 8601)', example: '2024-12-31' })
  @IsString()
  @IsNotEmpty({ message: 'dateTo is required (ISO 8601, e.g. 2024-12-31)' })
  @IsDateString({}, { message: 'dateTo must be a valid ISO 8601 date string' })
  dateTo: string;

  @ApiPropertyOptional({ description: 'Export format', enum: ['csv', 'xlsx'], default: 'csv' })
  @IsOptional()
  @IsEnum(['csv', 'xlsx'], { message: 'format must be one of: csv, xlsx' })
  format?: string;
}
