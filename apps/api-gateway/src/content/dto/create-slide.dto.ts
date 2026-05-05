import { IsString, IsOptional, IsBoolean, IsInt, IsUrl, Matches, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

/**
 * Allow either an absolute http(s) URL or a root-relative path (e.g. "/products/123").
 * Explicitly rejects unsafe schemes (javascript:, data:, vbscript:, file:, etc.).
 */
const LINK_URL_PATTERN = /^(?:https?:\/\/[^\s]+|\/[^\s]*)$/;

export class CreateSlideDto {
  @ApiProperty({ description: 'Title in French' })
  @IsString()
  titleFr: string;

  @ApiProperty({ description: 'Title in English' })
  @IsString()
  titleEn: string;

  @ApiPropertyOptional({ description: 'Subtitle in French' })
  @IsOptional()
  @IsString()
  subtitleFr?: string;

  @ApiPropertyOptional({ description: 'Subtitle in English' })
  @IsOptional()
  @IsString()
  subtitleEn?: string;

  @ApiPropertyOptional({ description: 'Image URL' })
  @IsOptional()
  @IsUrl()
  imageUrl?: string;

  @ApiPropertyOptional({
    description: 'Link URL: absolute http(s) URL or root-relative path (e.g. /products/123)',
  })
  @IsOptional()
  @IsString()
  @Matches(LINK_URL_PATTERN, {
    message: 'linkUrl must be an absolute http(s) URL or a root-relative path (e.g. /products/123)',
  })
  linkUrl?: string;

  @ApiPropertyOptional({ description: 'Link text in French' })
  @IsOptional()
  @IsString()
  linkTextFr?: string;

  @ApiPropertyOptional({ description: 'Link text in English' })
  @IsOptional()
  @IsString()
  linkTextEn?: string;

  @ApiPropertyOptional({ description: 'Whether the slide is active', default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Display order', default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Transform(({ value }) => (value !== undefined ? parseInt(value, 10) : 0))
  displayOrder?: number;
}
