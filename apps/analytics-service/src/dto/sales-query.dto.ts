import { IsOptional, IsEnum } from 'class-validator';

export enum SalesPeriod {
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
  @IsEnum(SalesPeriod)
  period?: SalesPeriod = SalesPeriod.MONTH;

  @IsOptional()
  @IsEnum(SalesGroupBy)
  groupBy?: SalesGroupBy = SalesGroupBy.DAY;
}
