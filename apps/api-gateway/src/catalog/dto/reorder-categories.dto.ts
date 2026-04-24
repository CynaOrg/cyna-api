import { IsArray, IsUUID, ArrayMinSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ReorderCategoriesDto {
  @ApiProperty({
    description: 'Ordered list of category IDs',
    type: [String],
    example: ['6f0a4b02-a6f8-4b7d-9c1e-3a7b1c5f9d10', 'a3c2b1d0-1234-4aaa-9bbb-c0ffee000000'],
  })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  categoryIds: string[];
}
