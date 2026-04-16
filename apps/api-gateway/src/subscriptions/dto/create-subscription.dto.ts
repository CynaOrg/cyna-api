import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsObject, IsOptional, IsUUID, ValidateNested } from 'class-validator';
import { AddressDto, BillingPeriod } from '@cyna-api/common';

export class CreateSubscriptionDto {
  @ApiProperty({ description: 'Product identifier (UUID)' })
  @IsUUID()
  productId: string;

  @ApiProperty({ enum: BillingPeriod })
  @IsEnum(BillingPeriod)
  billingPeriod: BillingPeriod;

  @ApiProperty({ type: AddressDto })
  @IsObject()
  @ValidateNested()
  @Type(() => AddressDto)
  billingAddress: AddressDto;
}

export class CancelSubscriptionDto {
  @ApiPropertyOptional({ default: true })
  @IsOptional()
  cancelAtPeriodEnd?: boolean;
}
