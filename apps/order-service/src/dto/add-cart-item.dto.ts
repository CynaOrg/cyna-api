import { IsUUID, IsInt, Min, IsEnum, IsOptional } from 'class-validator';
import { BillingPeriod } from '@cyna-api/common';

export class AddCartItemDto {
  @IsUUID()
  productId: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsEnum(BillingPeriod)
  @IsOptional()
  billingPeriod?: BillingPeriod = BillingPeriod.ONE_TIME;
}
