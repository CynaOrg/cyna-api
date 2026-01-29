import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  IsNumber,
  IsPositive,
  IsEnum,
  IsUUID,
  IsArray,
  MaxLength,
  Min,
  Matches,
  ValidateNested,
  ValidateIf,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ProductType } from '@cyna-api/common';

/**
 * DTO for product characteristics (embedded)
 */
export class ProductCharacteristicInputDto {
  @IsNotEmpty({ message: 'validation.string.required' })
  @IsString()
  @MaxLength(100, { message: 'validation.string.maxLength' })
  keyFr: string;

  @IsNotEmpty({ message: 'validation.string.required' })
  @IsString()
  @MaxLength(100, { message: 'validation.string.maxLength' })
  keyEn: string;

  @IsNotEmpty({ message: 'validation.string.required' })
  @IsString()
  @MaxLength(255, { message: 'validation.string.maxLength' })
  valueFr: string;

  @IsNotEmpty({ message: 'validation.string.required' })
  @IsString()
  @MaxLength(255, { message: 'validation.string.maxLength' })
  valueEn: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'validation.number.integer' })
  @Min(0, { message: 'validation.number.min' })
  displayOrder?: number = 0;
}

/**
 * Create Product DTO
 * Includes conditional validation based on product type:
 * - SaaS: requires priceMonthly and/or priceYearly
 * - Digital: requires priceUnit, no stock
 * - Physical: requires priceUnit and stockQuantity
 */
export class CreateProductDto {
  @IsNotEmpty({ message: 'validation.uuid.invalid' })
  @IsUUID('4', { message: 'validation.uuid.invalid' })
  categoryId: string;

  @IsNotEmpty({ message: 'validation.string.required' })
  @IsString()
  @MaxLength(150, { message: 'validation.string.maxLength' })
  @Matches(/^[a-z0-9\-]+$/, { message: 'validation.slug.invalid' })
  slug: string;

  @IsNotEmpty({ message: 'validation.string.required' })
  @IsString()
  @MaxLength(50, { message: 'validation.string.maxLength' })
  @Transform(({ value }) => value?.toUpperCase().trim())
  sku: string;

  @IsNotEmpty({ message: 'validation.string.required' })
  @IsString()
  @MaxLength(200, { message: 'validation.string.maxLength' })
  @Transform(({ value }) => value?.trim())
  nameFr: string;

  @IsNotEmpty({ message: 'validation.string.required' })
  @IsString()
  @MaxLength(200, { message: 'validation.string.maxLength' })
  @Transform(({ value }) => value?.trim())
  nameEn: string;

  @IsNotEmpty({ message: 'validation.string.required' })
  @IsString()
  @Transform(({ value }) => value?.trim())
  descriptionFr: string;

  @IsNotEmpty({ message: 'validation.string.required' })
  @IsString()
  @Transform(({ value }) => value?.trim())
  descriptionEn: string;

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

  @IsNotEmpty({ message: 'validation.enum.invalid' })
  @IsEnum(ProductType, { message: 'validation.enum.invalid' })
  productType: ProductType;

  // SaaS pricing - at least one required for SaaS products
  @ValidateIf((o) => o.productType === ProductType.SAAS)
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'validation.number.invalid' })
  @IsPositive({ message: 'validation.number.positive' })
  priceMonthly?: number;

  @ValidateIf((o) => o.productType === ProductType.SAAS)
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'validation.number.invalid' })
  @IsPositive({ message: 'validation.number.positive' })
  priceYearly?: number;

  // Unit pricing - required for digital and physical products
  @ValidateIf((o) => o.productType === ProductType.DIGITAL || o.productType === ProductType.PHYSICAL)
  @IsNotEmpty({ message: 'validation.string.required' })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'validation.number.invalid' })
  @IsPositive({ message: 'validation.number.positive' })
  priceUnit?: number;

  // Stock quantity - required for physical products
  @ValidateIf((o) => o.productType === ProductType.PHYSICAL)
  @IsNotEmpty({ message: 'validation.string.required' })
  @Type(() => Number)
  @IsInt({ message: 'validation.number.integer' })
  @Min(0, { message: 'validation.number.min' })
  stockQuantity?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'validation.number.integer' })
  @Min(0, { message: 'validation.number.min' })
  stockAlertThreshold?: number = 10;

  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean = true;

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean = false;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'validation.number.integer' })
  @Min(0, { message: 'validation.number.min' })
  displayOrder?: number = 0;

  // Stripe IDs (optional, can be set later)
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

  // Characteristics (optional, can be added via separate endpoint)
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProductCharacteristicInputDto)
  characteristics?: ProductCharacteristicInputDto[];
}
