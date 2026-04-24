import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RequestContentUploadUrlDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fileName: string;

  @IsIn(['image/jpeg', 'image/png', 'image/webp'])
  contentType: string;
}

export class ContentPresignedUploadResponseDto {
  uploadUrl: string;
  storageKey: string;
  publicUrl: string;
  expiresAt: Date;
}
