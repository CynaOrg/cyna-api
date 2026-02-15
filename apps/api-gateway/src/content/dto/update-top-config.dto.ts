import { IsArray, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateTopConfigDto {
  @ApiProperty({ description: 'Ordered array of product IDs', type: [String] })
  @IsArray()
  @IsUUID('4', { each: true })
  productIds: string[];
}
