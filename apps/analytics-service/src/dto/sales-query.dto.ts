import { IsOptional, IsEnum } from 'class-validator';

export enum SalesPeriod {
  TODAY = 'today',
  WEEK = 'week',
  MONTH = 'month',
  QUARTER = 'quarter',
  YEAR = 'year',
}

export enum SalesGroupBy {
  DAY = 'day',
  WEEK = 'week',
  MONTH = 'month',
}

export class SalesQueryDto {
  @IsOptional()
  @IsEnum(SalesPeriod, {
    message: `period must be one of: ${Object.values(SalesPeriod).join(', ')}`,
  })
  period?: SalesPeriod = SalesPeriod.MONTH;

  @IsOptional()
  @IsEnum(SalesGroupBy, {
    message: `groupBy must be one of: ${Object.values(SalesGroupBy).join(', ')}`,
  })
  groupBy?: SalesGroupBy = SalesGroupBy.DAY;
}
