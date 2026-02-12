import { IsUUID, IsEnum, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { BillingPeriod, AddressDto } from '@cyna-api/common';

export class CreateSubscriptionDto {
  @IsUUID()
  userId: string;

  @IsUUID()
  productId: string;

  @IsEnum(BillingPeriod)
  billingPeriod: BillingPeriod;

  @ValidateNested()
  @Type(() => AddressDto)
  billingAddress: AddressDto;
}
