import {
  IsOptional,
  IsString,
  IsBoolean,
  IsInt,
  IsUrl,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { Transform } from 'class-transformer';

/**
 * Allow either an absolute http(s) URL or a root-relative path (e.g. "/products/123").
 * Explicitly rejects unsafe schemes (javascript:, data:, vbscript:, file:, etc.).
 */
const LINK_URL_PATTERN = /^(?:https?:\/\/[^\s]+|\/(?![/\\])[^\s]*)$/;

export class UpdateCarouselSlideDto {
  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'validation.titleFr.maxLength' })
  @Transform(({ value }) => value?.trim())
  titleFr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200, { message: 'validation.titleEn.maxLength' })
  @Transform(({ value }) => value?.trim())
  titleEn?: string;

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
  @IsString()
  @Matches(LINK_URL_PATTERN, { message: 'validation.linkUrl.invalid' })
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
  displayOrder?: number;

  @IsOptional()
  @IsBoolean({ message: 'validation.isActive.invalid' })
  isActive?: boolean;
}
