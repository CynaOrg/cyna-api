import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  IsUUID,
  IsUrl,
  IsArray,
  MaxLength,
  Min,
  ArrayMinSize,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { Language } from '@cyna-api/common';
import { ProductImage } from '../entities';

/**
 * Create Product Image DTO
 */
export class CreateProductImageDto {
  @IsNotEmpty({ message: 'validation.url.invalid' })
  @IsString()
  @MaxLength(500, { message: 'validation.string.maxLength' })
  imageUrl: string;

  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'validation.string.maxLength' })
  @Transform(({ value }) => value?.trim())
  altTextFr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'validation.string.maxLength' })
  @Transform(({ value }) => value?.trim())
  altTextEn?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'validation.number.integer' })
  @Min(0, { message: 'validation.number.min' })
  displayOrder?: number = 0;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean = false;
}

/**
 * Update Product Image DTO
 */
export class UpdateProductImageDto {
  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'validation.string.maxLength' })
  imageUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'validation.string.maxLength' })
  @Transform(({ value }) => value?.trim())
  altTextFr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255, { message: 'validation.string.maxLength' })
  @Transform(({ value }) => value?.trim())
  altTextEn?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'validation.number.integer' })
  @Min(0, { message: 'validation.number.min' })
  displayOrder?: number;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

/**
 * Reorder Images DTO
 */
export class ReorderImagesDto {
  @IsNotEmpty()
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true, message: 'validation.uuid.invalid' })
  imageIds: string[];
}

/**
 * Set Primary Image DTO
 */
export class SetPrimaryImageDto {
  @IsNotEmpty({ message: 'validation.uuid.invalid' })
  @IsUUID('4', { message: 'validation.uuid.invalid' })
  imageId: string;
}

/**
 * Product Image Response DTO
 */
export class ProductImageResponseDto {
  id: string;
  imageUrl: string;
  altText?: string;
  displayOrder: number;
  isPrimary: boolean;
  createdAt: Date;

  static fromEntity(
    entity: ProductImage,
    lang: Language = Language.FR,
  ): ProductImageResponseDto {
    const dto = new ProductImageResponseDto();
    dto.id = entity.id;
    dto.imageUrl = entity.imageUrl;
    dto.altText = lang === Language.EN ? entity.altTextEn : entity.altTextFr;
    dto.displayOrder = entity.displayOrder;
    dto.isPrimary = entity.isPrimary;
    dto.createdAt = entity.createdAt;
    return dto;
  }
}

/**
 * Admin Product Image Response DTO (includes all language fields)
 */
export class ProductImageAdminResponseDto {
  id: string;
  productId: string;
  imageUrl: string;
  altTextFr?: string;
  altTextEn?: string;
  displayOrder: number;
  isPrimary: boolean;
  createdAt: Date;

  static fromEntity(entity: ProductImage): ProductImageAdminResponseDto {
    const dto = new ProductImageAdminResponseDto();
    dto.id = entity.id;
    dto.productId = entity.productId;
    dto.imageUrl = entity.imageUrl;
    dto.altTextFr = entity.altTextFr;
    dto.altTextEn = entity.altTextEn;
    dto.displayOrder = entity.displayOrder;
    dto.isPrimary = entity.isPrimary;
    dto.createdAt = entity.createdAt;
    return dto;
  }
}
