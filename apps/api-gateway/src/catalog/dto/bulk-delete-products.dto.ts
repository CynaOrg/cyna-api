import { IsArray, IsUUID, ArrayMinSize, ArrayMaxSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BulkDeleteProductsDto {
  @ApiProperty({
    description: 'List of product IDs to delete (max 100)',
    type: [String],
    example: ['6f0a4b02-a6f8-4b7d-9c1e-3a7b1c5f9d10', 'a3c2b1d0-1234-4aaa-9bbb-c0ffee000000'],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  productIds!: string[];
}
