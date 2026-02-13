import { IsString, IsNotEmpty, MaxLength, IsIn, IsNumber, Min, Max } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RequestUploadUrlDto {
  @ApiProperty({ description: 'Original file name', example: 'hero.jpg' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  fileName: string;

  @ApiProperty({
    description: 'MIME type of the image',
    enum: ['image/jpeg', 'image/png', 'image/webp'],
    example: 'image/jpeg',
  })
  @IsIn(['image/jpeg', 'image/png', 'image/webp'])
  contentType: string;

  @ApiProperty({ description: 'File size in bytes', example: 2048000 })
  @IsNumber()
  @Min(1)
  @Max(5_242_880) // 5MB
  fileSizeBytes: number;
}
