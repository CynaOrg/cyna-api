import { Type } from 'class-transformer';
import { IsArray, ValidateNested, ArrayMinSize } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { AddCartItemDto } from './add-cart-item.dto';

export class MergeCartDto {
  @ApiProperty({
    description: 'Items from the anonymous cart to merge',
    type: [AddCartItemDto],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AddCartItemDto)
  items: AddCartItemDto[];
}
