import { IsString, IsOptional, IsEnum, IsNotEmpty, IsDateString } from 'class-validator';

export enum ExportFormat {
  CSV = 'csv',
  XLSX = 'xlsx',
}

export class ExportQueryDto {
  @IsString()
  @IsNotEmpty({ message: 'dateFrom is required (ISO 8601, e.g. 2024-01-01)' })
  @IsDateString({}, { message: 'dateFrom must be a valid ISO 8601 date string' })
  dateFrom: string;

  @IsString()
  @IsNotEmpty({ message: 'dateTo is required (ISO 8601, e.g. 2024-12-31)' })
  @IsDateString({}, { message: 'dateTo must be a valid ISO 8601 date string' })
  dateTo: string;

  @IsOptional()
  @IsEnum(ExportFormat, {
    message: `format must be one of: ${Object.values(ExportFormat).join(', ')}`,
  })
  format?: ExportFormat = ExportFormat.CSV;
}
