import {
  IsOptional,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsString,
  MaxLength,
  Min,
  Max,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { Language } from '@cyna-api/common';
import { ProductType } from '../../entities';

// `enableImplicitConversion: true` coerces query strings to booleans BEFORE @Transform runs,
// turning 'false' into truthy boolean true. Read the raw value from `obj` to bypass that.
function coerceBooleanQuery(raw: unknown): unknown {
  if (typeof raw === 'boolean') return raw;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return raw;
}

export enum ProductSortBy {
  DISPLAY_ORDER = 'displayOrder',
  PRICE_MONTHLY = 'priceMonthly',
  PRICE_UNIT = 'priceUnit',
  CREATED_AT = 'createdAt',
}

export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

export class ProductQueryDto {
  @IsOptional()
  @IsInt({ message: 'validation.page.invalid' })
  @Min(1, { message: 'validation.page.min' })
  @Transform(({ value }) => (value ? parseInt(value, 10) : 1))
  page?: number = 1;

  @IsOptional()
  @IsInt({ message: 'validation.limit.invalid' })
  @Min(1, { message: 'validation.limit.min' })
  @Max(100, { message: 'validation.limit.max' })
  @Transform(({ value }) => (value ? parseInt(value, 10) : 20))
  limit?: number = 20;

  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'validation.categorySlug.maxLength' })
  @Transform(({ value }) => value?.toLowerCase().trim())
  categorySlug?: string;

  @IsOptional()
  @IsEnum(ProductType, { message: 'validation.productType.invalid' })
  productType?: ProductType;

  @IsOptional()
  @Transform(({ obj }) => coerceBooleanQuery(obj.isAvailable))
  @IsBoolean({ message: 'validation.isAvailable.invalid' })
  isAvailable?: boolean;

  @IsOptional()
  @Transform(({ obj }) => coerceBooleanQuery(obj.isFeatured))
  @IsBoolean({ message: 'validation.isFeatured.invalid' })
  isFeatured?: boolean;

  @IsOptional()
  @IsNumber({}, { message: 'validation.minPrice.invalid' })
  @Min(0, { message: 'validation.minPrice.min' })
  @Transform(({ value }) => (value ? parseFloat(value) : undefined))
  minPrice?: number;

  @IsOptional()
  @IsNumber({}, { message: 'validation.maxPrice.invalid' })
  @Min(0, { message: 'validation.maxPrice.min' })
  @Transform(({ value }) => (value ? parseFloat(value) : undefined))
  maxPrice?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'validation.search.maxLength' })
  @Transform(({ value }) => value?.trim())
  search?: string;

  @IsOptional()
  @IsEnum(ProductSortBy, { message: 'validation.sortBy.invalid' })
  sortBy?: ProductSortBy = ProductSortBy.DISPLAY_ORDER;

  @IsOptional()
  @IsEnum(SortOrder, { message: 'validation.sortOrder.invalid' })
  sortOrder?: SortOrder = SortOrder.ASC;

  @IsOptional()
  @IsEnum(Language, { message: 'validation.lang.invalid' })
  lang?: Language = Language.FR;
}
