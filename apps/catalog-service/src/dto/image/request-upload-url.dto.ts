import { IsUUID, IsString, IsNotEmpty, MaxLength, IsIn, IsNumber, Min, Max } from 'class-validator';

export class RequestUploadUrlDto {
  @IsUUID()
  productId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fileName: string;

  @IsIn(['image/jpeg', 'image/png', 'image/webp'])
  contentType: string;

  @IsNumber()
  @Min(1)
  @Max(5_242_880) // 5MB
  fileSizeBytes: number;
}
