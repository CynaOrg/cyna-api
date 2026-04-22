import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsObject,
  IsOptional,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { AddressDto, Language } from '@cyna-api/common';

export class CheckoutPaymentIntentDto {
  @ApiProperty({ description: 'Cart identifier (UUID)' })
  @IsUUID()
  cartId: string;

  @ApiPropertyOptional({
    description:
      'Recipient email for the order (optional if user is authenticated or guestEmail is provided)',
  })
  @IsOptional()
  @IsEmail({ allow_utf8_local_part: false })
  @MaxLength(255)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  email?: string;

  @ApiPropertyOptional({ description: 'Legacy alias for email used by older frontend builds' })
  @IsOptional()
  @IsEmail({ allow_utf8_local_part: false })
  @MaxLength(255)
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  guestEmail?: string;

  @ApiProperty({ type: AddressDto })
  @IsObject()
  @ValidateNested()
  @Type(() => AddressDto)
  billingAddress: AddressDto;

  @ApiPropertyOptional({ type: AddressDto })
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => AddressDto)
  shippingAddress?: AddressDto;

  @ApiPropertyOptional({ enum: Language, default: Language.FR })
  @IsOptional()
  @IsEnum(Language)
  preferredLanguage?: Language;
}
