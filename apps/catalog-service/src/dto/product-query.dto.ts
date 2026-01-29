import {
  IsOptional,
  IsString,
  IsBoolean,
  IsEnum,
  IsNumber,
  IsInt,
  MaxLength,
  Min,
  Max,
  MinLength,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ProductType, Language } from '@cyna-api/common';

/**
 * Product Query DTO for listing/filtering products
 */
export class ProductQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'validation.number.integer' })
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'validation.number.integer' })
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  categorySlug?: string;

  @IsOptional()
  @IsEnum(ProductType)
  productType?: ProductType;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isAvailable?: boolean;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isFeatured?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  @IsOptional()
  @IsEnum(['displayOrder', 'priceMonthly', 'priceUnit', 'createdAt', 'nameFr', 'nameEn'])
  sortBy?: string = 'displayOrder';

  @IsOptional()
  @IsEnum(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'asc';

  @IsOptional()
  @IsEnum(Language)
  lang?: Language;
}

/**
 * Product Search DTO for full-text search
 */
export class SearchProductDto extends ProductQueryDto {
  @IsString()
  @MinLength(2, { message: 'validation.string.minLength' })
  @MaxLength(255, { message: 'validation.string.maxLength' })
  @Transform(({ value }) => value?.trim())
  q: string;
}

/**
 * Featured Products Query DTO
 */
export class FeaturedProductsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number = 8;

  @IsOptional()
  @IsEnum(Language)
  lang?: Language;
}

/**
 * Update Stock DTO (admin endpoint)
 */
export class UpdateStockDto {
  @Type(() => Number)
  @IsInt({ message: 'validation.number.integer' })
  @Min(0, { message: 'validation.number.min' })
  stockQuantity: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'validation.number.integer' })
  @Min(0, { message: 'validation.number.min' })
  stockAlertThreshold?: number;
}
