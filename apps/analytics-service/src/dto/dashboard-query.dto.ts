import { IsOptional, IsEnum } from 'class-validator';

export enum DashboardPeriod {
  TODAY = 'today',
  WEEK = 'week',
  MONTH = 'month',
  QUARTER = 'quarter',
  YEAR = 'year',
}

export class DashboardQueryDto {
  @IsOptional()
  @IsEnum(DashboardPeriod, {
    message: `period must be one of: ${Object.values(DashboardPeriod).join(', ')}`,
  })
  period?: DashboardPeriod = DashboardPeriod.MONTH;
}
