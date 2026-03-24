import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  IsUrl,
  MaxLength,
  Matches,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateCategoryDto {
  @IsNotEmpty({ message: 'validation.slug.required' })
  @IsString()
  @MaxLength(100, { message: 'validation.slug.maxLength' })
  @Matches(/^[a-z0-9-]+$/, { message: 'validation.slug.invalid' })
  @Transform(({ value }) => value?.toLowerCase().trim())
  slug: string;

  @IsNotEmpty({ message: 'validation.nameFr.required' })
  @IsString()
  @MaxLength(100, { message: 'validation.nameFr.maxLength' })
  @Transform(({ value }) => value?.trim())
  nameFr: string;

  @IsNotEmpty({ message: 'validation.nameEn.required' })
  @IsString()
  @MaxLength(100, { message: 'validation.nameEn.maxLength' })
  @Transform(({ value }) => value?.trim())
  nameEn: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  descriptionFr?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  descriptionEn?: string;

  @IsOptional()
  @IsUrl({}, { message: 'validation.imageUrl.invalid' })
  imageUrl?: string;

  @IsOptional()
  @IsInt({ message: 'validation.displayOrder.invalid' })
  @Min(0, { message: 'validation.displayOrder.min' })
  @Transform(({ value }) => (value !== undefined ? parseInt(value, 10) : 0))
  displayOrder?: number = 0;

  @IsOptional()
  @IsBoolean({ message: 'validation.isActive.invalid' })
  @Transform(({ value }) => (value !== undefined ? value : true))
  isActive?: boolean = true;
}
