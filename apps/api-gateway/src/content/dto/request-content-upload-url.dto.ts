import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RequestContentUploadUrlDto {
  @ApiProperty({ description: 'Original file name', example: 'carousel-hero.jpg' })
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
}
