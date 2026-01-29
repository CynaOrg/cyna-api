import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  IsNumber,
  IsPositive,
  IsUUID,
  IsArray,
  MaxLength,
  Min,
  Matches,
  ValidateNested,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ProductCharacteristicInputDto } from './create-product.dto';

/**
 * Update Product DTO
 * All fields are optional. Note: productType cannot be changed after creation.
 */
export class UpdateProductDto {
  @IsOptional()
  @IsUUID('4', { message: 'validation.uuid.invalid' })
  categoryId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(150, { message: 'validation.string.maxLength' })
  @Matches(/^[a-z0-9\-]+$/, { message: 'validation.slug.invalid' })
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'validation.string.maxLength' })
  @Transform(({ value }) => value?.toUpperCase().trim())
  sku?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'validation.string.maxLength' })
  @Transform(({ value }) => value?.trim())
  nameFr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'validation.string.maxLength' })
  @Transform(({ value }) => value?.trim())
  nameEn?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  descriptionFr?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  descriptionEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300, { message: 'validation.string.maxLength' })
  @Transform(({ value }) => value?.trim())
  shortDescriptionFr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300, { message: 'validation.string.maxLength' })
  @Transform(({ value }) => value?.trim())
  shortDescriptionEn?: string;

  // Pricing - can be updated for any product type
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'validation.number.invalid' })
  @IsPositive({ message: 'validation.number.positive' })
  priceMonthly?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'validation.number.invalid' })
  @IsPositive({ message: 'validation.number.positive' })
  priceYearly?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'validation.number.invalid' })
  @IsPositive({ message: 'validation.number.positive' })
  priceUnit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'validation.number.integer' })
  @Min(0, { message: 'validation.number.min' })
  stockAlertThreshold?: number;

  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'validation.number.integer' })
  @Min(0, { message: 'validation.number.min' })
  displayOrder?: number;

  // Stripe IDs
  @IsOptional()
  @IsString()
  @MaxLength(255)
  stripeProductId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  stripePriceIdMonthly?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  stripePriceIdYearly?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  stripePriceIdUnit?: string;

  // Characteristics replacement (replaces all existing)
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductCharacteristicInputDto)
  characteristics?: ProductCharacteristicInputDto[];
}
