import { IsString, IsOptional, IsBoolean, IsInt, IsUrl, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

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

  @ApiPropertyOptional({ description: 'Link URL' })
  @IsOptional()
  @IsUrl()
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
