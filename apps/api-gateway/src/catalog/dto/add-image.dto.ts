import { IsNotEmpty, IsString, IsOptional, IsBoolean, IsUrl, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AddImageDto {
  @ApiProperty({ description: 'Image URL' })
  @IsNotEmpty()
  @IsUrl()
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
  isPrimary?: boolean = false;
}
