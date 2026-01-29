import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  MaxLength,
  Min,
  Matches,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class CreateCategoryDto {
  @IsNotEmpty({ message: 'validation.string.required' })
  @IsString()
  @MaxLength(100, { message: 'validation.string.maxLength' })
  @Matches(/^[a-z0-9\-]+$/, { message: 'validation.slug.invalid' })
  slug: string;

  @IsNotEmpty({ message: 'validation.string.required' })
  @IsString()
  @MaxLength(100, { message: 'validation.string.maxLength' })
  @Transform(({ value }) => value?.trim())
  nameFr: string;

  @IsNotEmpty({ message: 'validation.string.required' })
  @IsString()
  @MaxLength(100, { message: 'validation.string.maxLength' })
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
  @IsString()
  @MaxLength(500, { message: 'validation.string.maxLength' })
  imageUrl?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'validation.number.integer' })
  @Min(0, { message: 'validation.number.min' })
  displayOrder?: number = 0;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean = true;
}
