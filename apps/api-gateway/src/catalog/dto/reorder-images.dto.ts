import { IsArray, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ReorderImagesDto {
  @ApiProperty({ description: 'Array of image IDs in desired order', type: [String] })
  @IsArray()
  @IsUUID('4', { each: true })
  imageIds: string[];
}
