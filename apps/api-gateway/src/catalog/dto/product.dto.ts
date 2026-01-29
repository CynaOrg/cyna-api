import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  IsNumber,
  Min,
  IsEnum,
  MinLength,
  MaxLength,
  IsUUID,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { Language, ProductType } from '@cyna-api/common';

export class ProductQueryDto {
  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: 'Items per page', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @ApiPropertyOptional({ description: 'Filter by category slug' })
  @IsOptional()
  @IsString()
  categorySlug?: string;

  @ApiPropertyOptional({ enum: ProductType, description: 'Filter by product type' })
  @IsOptional()
  @IsEnum(ProductType)
  productType?: ProductType;

  @ApiPropertyOptional({ description: 'Filter by availability' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isAvailable?: boolean;

  @ApiPropertyOptional({ description: 'Filter by featured status' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isFeatured?: boolean;

  @ApiPropertyOptional({ description: 'Minimum price filter' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @ApiPropertyOptional({ description: 'Maximum price filter' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  @ApiPropertyOptional({
    enum: ['displayOrder', 'priceMonthly', 'priceUnit', 'createdAt', 'nameFr', 'nameEn'],
    default: 'displayOrder',
  })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc';

  @ApiPropertyOptional({ enum: Language, default: Language.FR })
  @IsOptional()
  @IsEnum(Language)
  lang?: Language;
}

export class SearchProductDto {
  @ApiProperty({ description: 'Search query', minLength: 2 })
  @IsString()
  @MinLength(2)
  q: string;

  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: 'Items per page', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @ApiPropertyOptional({ description: 'Filter by category slug' })
  @IsOptional()
  @IsString()
  categorySlug?: string;

  @ApiPropertyOptional({ enum: ProductType })
  @IsOptional()
  @IsEnum(ProductType)
  productType?: ProductType;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc';

  @ApiPropertyOptional({ enum: Language, default: Language.FR })
  @IsOptional()
  @IsEnum(Language)
  lang?: Language;
}

export class FeaturedProductsQueryDto {
  @ApiPropertyOptional({ description: 'Number of featured products to return', default: 8 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @ApiPropertyOptional({ enum: Language, default: Language.FR })
  @IsOptional()
  @IsEnum(Language)
  lang?: Language;
}

export class CreateProductDto {
  @ApiProperty({ description: 'Category ID' })
  @IsUUID('4')
  categoryId: string;

  @ApiProperty({ example: 'soc-premium', description: 'URL-friendly slug' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  slug: string;

  @ApiProperty({ example: 'SOC-PREM-001', description: 'SKU' })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  sku: string;

  @ApiProperty({ example: 'SOC Premium', description: 'French name' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  nameFr: string;

  @ApiPropertyOptional({ example: 'Premium SOC', description: 'English name' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nameEn?: string;

  @ApiProperty({ description: 'French description' })
  @IsString()
  descriptionFr: string;

  @ApiPropertyOptional({ description: 'English description' })
  @IsOptional()
  @IsString()
  descriptionEn?: string;

  @ApiPropertyOptional({ description: 'French short description' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  shortDescriptionFr?: string;

  @ApiPropertyOptional({ description: 'English short description' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  shortDescriptionEn?: string;

  @ApiProperty({ enum: ProductType })
  @IsEnum(ProductType)
  productType: ProductType;

  @ApiPropertyOptional({ description: 'Monthly price (for SaaS)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  priceMonthly?: number;

  @ApiPropertyOptional({ description: 'Yearly price (for SaaS)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  priceYearly?: number;

  @ApiPropertyOptional({ description: 'Unit price (for physical/digital)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  priceUnit?: number;

  @ApiPropertyOptional({ description: 'Stock quantity (for physical products)' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stockQuantity?: number;

  @ApiPropertyOptional({ description: 'Stock alert threshold', default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stockAlertThreshold?: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  displayOrder?: number;

  @ApiPropertyOptional({ description: 'Stripe product ID' })
  @IsOptional()
  @IsString()
  stripeProductId?: string;

  @ApiPropertyOptional({ description: 'Stripe price ID (monthly)' })
  @IsOptional()
  @IsString()
  stripePriceIdMonthly?: string;

  @ApiPropertyOptional({ description: 'Stripe price ID (yearly)' })
  @IsOptional()
  @IsString()
  stripePriceIdYearly?: string;

  @ApiPropertyOptional({ description: 'Stripe price ID (unit)' })
  @IsOptional()
  @IsString()
  stripePriceIdUnit?: string;
}

export class UpdateProductDto {
  @ApiPropertyOptional({ description: 'Category ID' })
  @IsOptional()
  @IsUUID('4')
  categoryId?: string;

  @ApiPropertyOptional({ description: 'URL-friendly slug' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  slug?: string;

  @ApiPropertyOptional({ description: 'SKU' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  sku?: string;

  @ApiPropertyOptional({ description: 'French name' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  nameFr?: string;

  @ApiPropertyOptional({ description: 'English name' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nameEn?: string;

  @ApiPropertyOptional({ description: 'French description' })
  @IsOptional()
  @IsString()
  descriptionFr?: string;

  @ApiPropertyOptional({ description: 'English description' })
  @IsOptional()
  @IsString()
  descriptionEn?: string;

  @ApiPropertyOptional({ description: 'French short description' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  shortDescriptionFr?: string;

  @ApiPropertyOptional({ description: 'English short description' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  shortDescriptionEn?: string;

  @ApiPropertyOptional({ description: 'Monthly price' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  priceMonthly?: number;

  @ApiPropertyOptional({ description: 'Yearly price' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  priceYearly?: number;

  @ApiPropertyOptional({ description: 'Unit price' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  priceUnit?: number;

  @ApiPropertyOptional({ description: 'Stock alert threshold' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stockAlertThreshold?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  displayOrder?: number;

  @ApiPropertyOptional({ description: 'Stripe product ID' })
  @IsOptional()
  @IsString()
  stripeProductId?: string;

  @ApiPropertyOptional({ description: 'Stripe price ID (monthly)' })
  @IsOptional()
  @IsString()
  stripePriceIdMonthly?: string;

  @ApiPropertyOptional({ description: 'Stripe price ID (yearly)' })
  @IsOptional()
  @IsString()
  stripePriceIdYearly?: string;

  @ApiPropertyOptional({ description: 'Stripe price ID (unit)' })
  @IsOptional()
  @IsString()
  stripePriceIdUnit?: string;
}

export class UpdateStockDto {
  @ApiProperty({ description: 'New stock quantity' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stockQuantity: number;

  @ApiPropertyOptional({ description: 'Stock alert threshold' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stockAlertThreshold?: number;
}
