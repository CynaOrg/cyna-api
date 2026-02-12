import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  IsUrl,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateCarouselSlideDto {
  @IsNotEmpty({ message: 'validation.titleFr.required' })
  @IsString()
  @MaxLength(200, { message: 'validation.titleFr.maxLength' })
  @Transform(({ value }) => value?.trim())
  titleFr: string;

  @IsNotEmpty({ message: 'validation.titleEn.required' })
  @IsString()
  @MaxLength(200, { message: 'validation.titleEn.maxLength' })
  @Transform(({ value }) => value?.trim())
  titleEn: string;

  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'validation.subtitleFr.maxLength' })
  @Transform(({ value }) => value?.trim())
  subtitleFr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'validation.subtitleEn.maxLength' })
  @Transform(({ value }) => value?.trim())
  subtitleEn?: string;

  @IsOptional()
  @IsUrl({}, { message: 'validation.imageUrl.invalid' })
  imageUrl?: string;

  @IsOptional()
  @IsUrl({}, { message: 'validation.linkUrl.invalid' })
  linkUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'validation.linkTextFr.maxLength' })
  @Transform(({ value }) => value?.trim())
  linkTextFr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50, { message: 'validation.linkTextEn.maxLength' })
  @Transform(({ value }) => value?.trim())
  linkTextEn?: string;

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
