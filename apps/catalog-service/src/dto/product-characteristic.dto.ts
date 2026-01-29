import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsInt,
  IsUUID,
  IsArray,
  MaxLength,
  Min,
  ArrayMinSize,
  ValidateNested,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { Language } from '@cyna-api/common';
import { ProductCharacteristic } from '../entities';

/**
 * Create Product Characteristic DTO
 */
export class CreateProductCharacteristicDto {
  @IsNotEmpty({ message: 'validation.string.required' })
  @IsString()
  @MaxLength(100, { message: 'validation.string.maxLength' })
  @Transform(({ value }) => value?.trim())
  keyFr: string;

  @IsNotEmpty({ message: 'validation.string.required' })
  @IsString()
  @MaxLength(100, { message: 'validation.string.maxLength' })
  @Transform(({ value }) => value?.trim())
  keyEn: string;

  @IsNotEmpty({ message: 'validation.string.required' })
  @IsString()
  @MaxLength(255, { message: 'validation.string.maxLength' })
  @Transform(({ value }) => value?.trim())
  valueFr: string;

  @IsNotEmpty({ message: 'validation.string.required' })
  @IsString()
  @MaxLength(255, { message: 'validation.string.maxLength' })
  @Transform(({ value }) => value?.trim())
  valueEn: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'validation.number.integer' })
  @Min(0, { message: 'validation.number.min' })
  displayOrder?: number = 0;
}

/**
 * Update Product Characteristic DTO
 */
export class UpdateProductCharacteristicDto {
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'validation.string.maxLength' })
  @Transform(({ value }) => value?.trim())
  keyFr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'validation.string.maxLength' })
  @Transform(({ value }) => value?.trim())
  keyEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'validation.string.maxLength' })
  @Transform(({ value }) => value?.trim())
  valueFr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'validation.string.maxLength' })
  @Transform(({ value }) => value?.trim())
  valueEn?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'validation.number.integer' })
  @Min(0, { message: 'validation.number.min' })
  displayOrder?: number;
}

/**
 * Bulk Create/Update Characteristics DTO
 * Replaces all characteristics for a product
 */
export class BulkCharacteristicsDto {
  @IsNotEmpty()
  @IsArray()
  @ArrayMinSize(0)
  @ValidateNested({ each: true })
  @Type(() => CreateProductCharacteristicDto)
  characteristics: CreateProductCharacteristicDto[];
}

/**
 * Reorder Characteristics DTO
 */
export class ReorderCharacteristicsDto {
  @IsNotEmpty()
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true, message: 'validation.uuid.invalid' })
  characteristicIds: string[];
}

/**
 * Product Characteristic Response DTO (localized)
 */
export class ProductCharacteristicResponseDto {
  id: string;
  key: string;
  value: string;
  displayOrder: number;

  static fromEntity(
    entity: ProductCharacteristic,
    lang: Language = Language.FR,
  ): ProductCharacteristicResponseDto {
    const dto = new ProductCharacteristicResponseDto();
    dto.id = entity.id;
    dto.key = lang === Language.EN ? entity.keyEn : entity.keyFr;
    dto.value = lang === Language.EN ? entity.valueEn : entity.valueFr;
    dto.displayOrder = entity.displayOrder;
    return dto;
  }
}

/**
 * Admin Product Characteristic Response DTO (includes all language fields)
 */
export class ProductCharacteristicAdminResponseDto {
  id: string;
  productId: string;
  keyFr: string;
  keyEn: string;
  valueFr: string;
  valueEn: string;
  displayOrder: number;
  createdAt: Date;
  updatedAt: Date;

  static fromEntity(entity: ProductCharacteristic): ProductCharacteristicAdminResponseDto {
    const dto = new ProductCharacteristicAdminResponseDto();
    dto.id = entity.id;
    dto.productId = entity.productId;
    dto.keyFr = entity.keyFr;
    dto.keyEn = entity.keyEn;
    dto.valueFr = entity.valueFr;
    dto.valueEn = entity.valueEn;
    dto.displayOrder = entity.displayOrder;
    dto.createdAt = entity.createdAt;
    dto.updatedAt = entity.updatedAt;
    return dto;
  }
}
