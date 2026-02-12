import { IsString, IsOptional, IsBoolean, IsNumber, IsUrl } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSlideDto {
  @ApiProperty({ description: 'Title in French' })
  @IsString()
  titleFr: string;

  @ApiPropertyOptional({ description: 'Title in English' })
  @IsOptional()
  @IsString()
  titleEn?: string;

  @ApiPropertyOptional({ description: 'Description in French' })
  @IsOptional()
  @IsString()
  descriptionFr?: string;

  @ApiPropertyOptional({ description: 'Description in English' })
  @IsOptional()
  @IsString()
  descriptionEn?: string;

  @ApiProperty({ description: 'Image URL' })
  @IsUrl()
  imageUrl: string;

  @ApiPropertyOptional({ description: 'Link URL' })
  @IsOptional()
  @IsUrl()
  linkUrl?: string;

  @ApiPropertyOptional({ description: 'Button text in French' })
  @IsOptional()
  @IsString()
  buttonTextFr?: string;

  @ApiPropertyOptional({ description: 'Button text in English' })
  @IsOptional()
  @IsString()
  buttonTextEn?: string;

  @ApiPropertyOptional({ description: 'Whether the slide is active', default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ description: 'Display order' })
  @IsOptional()
  @IsNumber()
  displayOrder?: number;
}
