import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsInt,
  IsArray,
  ValidateNested,
  Min,
  MaxLength,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

export class AddProductCharacteristicDto {
  @ApiProperty({ description: 'Characteristic key (e.g., "users_included")' })
  @IsString()
  @MaxLength(100)
  key: string;

  @ApiProperty({ description: 'French value' })
  @IsString()
  @MaxLength(500)
  valueFr: string;

  @ApiPropertyOptional({ description: 'English value' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  valueEn?: string;

  @ApiPropertyOptional({ description: 'Display order', default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  displayOrder?: number;
}

export class UpdateProductCharacteristicDto {
  @ApiPropertyOptional({ description: 'Characteristic key' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  key?: string;

  @ApiPropertyOptional({ description: 'French value' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  valueFr?: string;

  @ApiPropertyOptional({ description: 'English value' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  valueEn?: string;

  @ApiPropertyOptional({ description: 'Display order' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  displayOrder?: number;
}

export class CharacteristicItemDto {
  @ApiProperty({ description: 'Characteristic key' })
  @IsString()
  @MaxLength(100)
  key: string;

  @ApiProperty({ description: 'French value' })
  @IsString()
  @MaxLength(500)
  valueFr: string;

  @ApiPropertyOptional({ description: 'English value' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  valueEn?: string;

  @ApiPropertyOptional({ description: 'Display order' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  displayOrder?: number;
}

export class BulkUpsertCharacteristicsDto {
  @ApiProperty({
    description: 'Array of characteristics to upsert',
    type: [CharacteristicItemDto],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CharacteristicItemDto)
  characteristics: CharacteristicItemDto[];
}
