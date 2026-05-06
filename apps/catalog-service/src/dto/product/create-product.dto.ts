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
import { ProductType } from '../../entities';

export class CreateProductCharacteristicDto {
  @IsNotEmpty({ message: 'validation.keyFr.required' })
  @IsString()
  @MaxLength(100, { message: 'validation.keyFr.maxLength' })
  @Transform(({ value }) => value?.trim())
  keyFr: string;

  @IsNotEmpty({ message: 'validation.keyEn.required' })
  @IsString()
  @MaxLength(100, { message: 'validation.keyEn.maxLength' })
  @Transform(({ value }) => value?.trim())
  keyEn: string;

  @IsNotEmpty({ message: 'validation.valueFr.required' })
  @IsString()
  @MaxLength(255, { message: 'validation.valueFr.maxLength' })
  @Transform(({ value }) => value?.trim())
  valueFr: string;

  @IsNotEmpty({ message: 'validation.valueEn.required' })
  @IsString()
  @MaxLength(255, { message: 'validation.valueEn.maxLength' })
  @Transform(({ value }) => value?.trim())
  valueEn: string;

  @IsOptional()
  @IsInt({ message: 'validation.displayOrder.invalid' })
  @Min(0, { message: 'validation.displayOrder.min' })
  @Transform(({ value }) => (value === undefined || value === null ? 0 : parseInt(value, 10)))
  displayOrder?: number = 0;
}

export class CreateProductDto {
  @IsNotEmpty({ message: 'validation.categoryId.required' })
  @IsUUID('4', { message: 'validation.categoryId.invalid' })
  categoryId: string;

  @IsNotEmpty({ message: 'validation.slug.required' })
  @IsString()
  @MaxLength(150, { message: 'validation.slug.maxLength' })
  @Matches(/^[a-z0-9-]+$/, { message: 'validation.slug.invalid' })
  @Transform(({ value }) => value?.toLowerCase().trim())
  slug: string;

  @IsNotEmpty({ message: 'validation.sku.required' })
  @IsString()
  @MaxLength(50, { message: 'validation.sku.maxLength' })
  @Transform(({ value }) => value?.toUpperCase().trim())
  sku: string;

  @IsNotEmpty({ message: 'validation.nameFr.required' })
  @IsString()
  @MaxLength(200, { message: 'validation.nameFr.maxLength' })
  @Transform(({ value }) => value?.trim())
  nameFr: string;

  @IsNotEmpty({ message: 'validation.nameEn.required' })
  @IsString()
  @MaxLength(200, { message: 'validation.nameEn.maxLength' })
  @Transform(({ value }) => value?.trim())
  nameEn: string;

  @IsNotEmpty({ message: 'validation.descriptionFr.required' })
  @IsString()
  @Transform(({ value }) => value?.trim())
  descriptionFr: string;

  @IsNotEmpty({ message: 'validation.descriptionEn.required' })
  @IsString()
  @Transform(({ value }) => value?.trim())
  descriptionEn: string;

  @IsOptional()
  @IsString()
  @MaxLength(300, { message: 'validation.shortDescriptionFr.maxLength' })
  @Transform(({ value }) => value?.trim())
  shortDescriptionFr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300, { message: 'validation.shortDescriptionEn.maxLength' })
  @Transform(({ value }) => value?.trim())
  shortDescriptionEn?: string;

  @IsNotEmpty({ message: 'validation.productType.required' })
  @IsEnum(ProductType, { message: 'validation.productType.invalid' })
  productType: ProductType;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'validation.priceMonthly.invalid' })
  @Min(0, { message: 'validation.priceMonthly.min' })
  @Transform(({ value }) => (value === undefined || value === null ? value : parseFloat(value)))
  priceMonthly?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'validation.priceYearly.invalid' })
  @Min(0, { message: 'validation.priceYearly.min' })
  @Transform(({ value }) => (value === undefined || value === null ? value : parseFloat(value)))
  priceYearly?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'validation.priceUnit.invalid' })
  @Min(0, { message: 'validation.priceUnit.min' })
  @Transform(({ value }) => (value === undefined || value === null ? value : parseFloat(value)))
  priceUnit?: number;

  @IsOptional()
  @IsInt({ message: 'validation.stockQuantity.invalid' })
  @Min(0, { message: 'validation.stockQuantity.min' })
  @Transform(({ value }) => (value === undefined || value === null ? value : parseInt(value, 10)))
  stockQuantity?: number;

  @IsOptional()
  @IsInt({ message: 'validation.stockAlertThreshold.invalid' })
  @Min(0, { message: 'validation.stockAlertThreshold.min' })
  @Transform(({ value }) => (value === undefined || value === null ? 10 : parseInt(value, 10)))
  stockAlertThreshold?: number = 10;

  @IsOptional()
  @IsBoolean({ message: 'validation.isAvailable.invalid' })
  @Transform(({ value }) => (value !== undefined ? value : true))
  isAvailable?: boolean = true;

  @IsOptional()
  @IsBoolean({ message: 'validation.isFeatured.invalid' })
  @Transform(({ value }) => (value !== undefined ? value : false))
  isFeatured?: boolean = false;

  @IsOptional()
  @IsInt({ message: 'validation.displayOrder.invalid' })
  @Min(0, { message: 'validation.displayOrder.min' })
  @Transform(({ value }) => (value === undefined || value === null ? 0 : parseInt(value, 10)))
  displayOrder?: number = 0;

  @IsOptional()
  @IsArray({ message: 'validation.characteristics.invalid' })
  @ValidateNested({ each: true })
  @Type(() => CreateProductCharacteristicDto)
  characteristics?: CreateProductCharacteristicDto[];

  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'validation.stripeProductId.maxLength' })
  stripeProductId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'validation.stripePriceIdMonthly.maxLength' })
  stripePriceIdMonthly?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'validation.stripePriceIdYearly.maxLength' })
  stripePriceIdYearly?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'validation.stripePriceIdUnit.maxLength' })
  stripePriceIdUnit?: string;
}
