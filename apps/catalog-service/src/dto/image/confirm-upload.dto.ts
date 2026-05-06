import {
  IsUUID,
  IsString,
  IsNotEmpty,
  MaxLength,
  IsOptional,
  IsBoolean,
  IsNumber,
  IsIn,
} from 'class-validator';
import { ALLOWED_IMAGE_MIME_TYPES } from '@cyna-api/common';

export class ConfirmUploadDto {
  @IsUUID()
  productId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  storageKey: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  altTextFr?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  altTextEn?: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @IsNumber()
  fileSizeBytes?: number;

  @IsOptional()
  @IsString()
  @IsIn(ALLOWED_IMAGE_MIME_TYPES)
  mimeType?: string;
}
