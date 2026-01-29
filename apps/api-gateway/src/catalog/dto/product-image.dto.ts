import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsInt,
  IsArray,
  IsUUID,
  Min,
  MaxLength,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

export class AddProductImageDto {
  @ApiProperty({ description: 'Image URL' })
  @IsString()
  @MaxLength(500)
  imageUrl: string;

  @ApiPropertyOptional({ description: 'French alt text' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  altTextFr?: string;

  @ApiPropertyOptional({ description: 'English alt text' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  altTextEn?: string;

  @ApiPropertyOptional({ description: 'Set as primary image', default: false })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @ApiPropertyOptional({ description: 'Display order', default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  displayOrder?: number;
}

export class UpdateProductImageDto {
  @ApiPropertyOptional({ description: 'Image URL' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  imageUrl?: string;

  @ApiPropertyOptional({ description: 'French alt text' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  altTextFr?: string;

  @ApiPropertyOptional({ description: 'English alt text' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  altTextEn?: string;

  @ApiPropertyOptional({ description: 'Display order' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  displayOrder?: number;
}

export class ReorderImagesDto {
  @ApiProperty({
    description: 'Array of image IDs in desired order',
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  imageIds: string[];
}
