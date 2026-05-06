import {
  IsString,
  IsNotEmpty,
  MaxLength,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsIn,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ALLOWED_IMAGE_MIME_TYPES } from '@cyna-api/common';

export class ConfirmUploadDto {
  @ApiProperty({ description: 'Storage key returned from upload-url endpoint' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  storageKey: string;

  @ApiPropertyOptional({ description: 'Alt text in French' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  altTextFr?: string;

  @ApiPropertyOptional({ description: 'Alt text in English' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  altTextEn?: string;

  @ApiPropertyOptional({ description: 'Set as primary image', default: false })
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @ApiPropertyOptional({ description: 'Original file size in bytes' })
  @IsOptional()
  @IsNumber()
  fileSizeBytes?: number;

  @ApiPropertyOptional({
    description: 'MIME type of the uploaded image',
    enum: ALLOWED_IMAGE_MIME_TYPES,
  })
  @IsOptional()
  @IsString()
  @IsIn(ALLOWED_IMAGE_MIME_TYPES)
  mimeType?: string;
}
