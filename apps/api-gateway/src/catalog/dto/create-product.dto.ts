import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  IsNumber,
  IsUUID,
  IsEnum,
  IsArray,
  ValidateNested,
  MaxLength,
  Matches,
  Min,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProductType } from './product-query.dto';

export class CreateProductCharacteristicDto {
  @ApiProperty({ description: 'French key', example: 'Utilisateurs' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  keyFr: string;

  @ApiProperty({ description: 'English key', example: 'Users' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  keyEn: string;

  @ApiProperty({ description: 'French value', example: 'Illimités' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  valueFr: string;

  @ApiProperty({ description: 'English value', example: 'Unlimited' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(255)
  valueEn: string;

  @ApiPropertyOptional({ description: 'Display order', default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number = 0;
}

export class CreateProductDto {
  @ApiProperty({ description: 'Category ID' })
  @IsNotEmpty()
  @IsUUID('4')
  categoryId: string;

  @ApiProperty({ description: 'URL-friendly identifier', example: 'crowdstrike-falcon' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(150)
  @Matches(/^[a-z0-9-]+$/)
  @Transform(({ value }) => value?.toLowerCase().trim())
  slug: string;

  @ApiProperty({ description: 'Stock Keeping Unit', example: 'CS-FALCON-001' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(50)
  @Transform(({ value }) => value?.toUpperCase().trim())
  sku: string;

  @ApiProperty({ description: 'French name' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(200)
  nameFr: string;

  @ApiProperty({ description: 'English name' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(200)
  nameEn: string;

  @ApiProperty({ description: 'French description' })
  @IsNotEmpty()
  @IsString()
  descriptionFr: string;

  @ApiProperty({ description: 'English description' })
  @IsNotEmpty()
  @IsString()
  descriptionEn: string;

  @ApiPropertyOptional({ description: 'French short description' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  shortDescriptionFr?: string;

  @ApiPropertyOptional({ description: 'English short description' })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  shortDescriptionEn?: string;

  @ApiProperty({ description: 'Product type', enum: ProductType })
  @IsNotEmpty()
  @IsEnum(ProductType)
  productType: ProductType;

  @ApiPropertyOptional({ description: 'Monthly price (SaaS)' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  priceMonthly?: number;

  @ApiPropertyOptional({ description: 'Yearly price (SaaS)' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  priceYearly?: number;

  @ApiPropertyOptional({ description: 'Unit price (physical/license)' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  priceUnit?: number;

  @ApiPropertyOptional({ description: 'Stock quantity (physical only)' })
  @IsOptional()
  @IsInt()
  @Min(0)
  stockQuantity?: number;

  @ApiPropertyOptional({ description: 'Stock alert threshold', default: 10 })
  @IsOptional()
  @IsInt()
  @Min(0)
  stockAlertThreshold?: number = 10;

  @ApiPropertyOptional({ description: 'Availability status', default: true })
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean = true;

  @ApiPropertyOptional({ description: 'Featured status', default: false })
  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean = false;

  @ApiPropertyOptional({ description: 'Display order', default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  displayOrder?: number = 0;

  @ApiPropertyOptional({
    description: 'Product characteristics',
    type: [CreateProductCharacteristicDto],
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateProductCharacteristicDto)
  characteristics?: CreateProductCharacteristicDto[];

  @ApiPropertyOptional({ description: 'Stripe Product ID' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  stripeProductId?: string;

  @ApiPropertyOptional({ description: 'Stripe Price ID (Monthly)' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  stripePriceIdMonthly?: string;

  @ApiPropertyOptional({ description: 'Stripe Price ID (Yearly)' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  stripePriceIdYearly?: string;

  @ApiPropertyOptional({ description: 'Stripe Price ID (Unit)' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  stripePriceIdUnit?: string;
}
