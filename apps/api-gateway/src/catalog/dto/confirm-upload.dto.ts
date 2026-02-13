import { IsString, IsNotEmpty, MaxLength, IsOptional, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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
}
