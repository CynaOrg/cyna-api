import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  Min,
  IsEnum,
  MinLength,
  MaxLength,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { Language } from '@cyna-api/common';

export class CategoryQueryDto {
  @ApiPropertyOptional({ description: 'Page number', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: 'Items per page', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @ApiPropertyOptional({ description: 'Filter by active status' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ enum: ['displayOrder', 'createdAt', 'nameFr', 'nameEn'] })
  @IsOptional()
  @IsString()
  sortBy?: string;

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsString()
  sortOrder?: 'asc' | 'desc';

  @ApiPropertyOptional({ enum: Language, default: Language.FR })
  @IsOptional()
  @IsEnum(Language)
  lang?: Language;
}

export class CreateCategoryDto {
  @ApiProperty({ example: 'soc-solutions', description: 'URL-friendly slug' })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  slug: string;

  @ApiProperty({ example: 'Solutions SOC', description: 'French name' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  nameFr: string;

  @ApiPropertyOptional({ example: 'SOC Solutions', description: 'English name' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nameEn?: string;

  @ApiPropertyOptional({ description: 'French description' })
  @IsOptional()
  @IsString()
  descriptionFr?: string;

  @ApiPropertyOptional({ description: 'English description' })
  @IsOptional()
  @IsString()
  descriptionEn?: string;

  @ApiPropertyOptional({ description: 'Image URL' })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  displayOrder?: number;
}

export class UpdateCategoryDto {
  @ApiPropertyOptional({ example: 'soc-solutions', description: 'URL-friendly slug' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  slug?: string;

  @ApiPropertyOptional({ example: 'Solutions SOC', description: 'French name' })
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  nameFr?: string;

  @ApiPropertyOptional({ example: 'SOC Solutions', description: 'English name' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  nameEn?: string;

  @ApiPropertyOptional({ description: 'French description' })
  @IsOptional()
  @IsString()
  descriptionFr?: string;

  @ApiPropertyOptional({ description: 'English description' })
  @IsOptional()
  @IsString()
  descriptionEn?: string;

  @ApiPropertyOptional({ description: 'Image URL' })
  @IsOptional()
  @IsString()
  imageUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  displayOrder?: number;
}
