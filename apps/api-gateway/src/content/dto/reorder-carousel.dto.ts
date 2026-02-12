import { IsArray, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ReorderCarouselDto {
  @ApiProperty({ description: 'Ordered array of slide IDs', type: [String] })
  @IsArray()
  @IsUUID('4', { each: true })
  slideIds: string[];
}
