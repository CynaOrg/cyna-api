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
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCategoryDto {
  @ApiProperty({ description: 'URL-friendly identifier', example: 'soc-solutions' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  @Matches(/^[a-z0-9\-]+$/)
  @Transform(({ value }) => value?.toLowerCase().trim())
  slug: string;

  @ApiProperty({ description: 'French name', example: 'Solutions SOC' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }) => value?.trim())
  nameFr: string;

  @ApiProperty({ description: 'English name', example: 'SOC Solutions' })
  @IsNotEmpty()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }) => value?.trim())
  nameEn: string;

  @ApiPropertyOptional({ description: 'French description' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  descriptionFr?: string;

  @ApiPropertyOptional({ description: 'English description' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => value?.trim())
  descriptionEn?: string;

  @ApiPropertyOptional({ description: 'Category image URL' })
  @IsOptional()
  @IsUrl()
  imageUrl?: string;

  @ApiPropertyOptional({ description: 'Display order', default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Transform(({ value }) => (value !== undefined ? parseInt(value, 10) : 0))
  displayOrder?: number = 0;

  @ApiPropertyOptional({ description: 'Active status', default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean = true;
}
