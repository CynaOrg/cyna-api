import { IsArray, IsUUID, ArrayMinSize, ArrayMaxSize } from 'class-validator';

export class UpdateTopProductsDto {
  @IsArray({ message: 'validation.productIds.isArray' })
  @IsUUID('4', { each: true, message: 'validation.productIds.isUUID' })
  @ArrayMinSize(1, { message: 'validation.productIds.minSize' })
  @ArrayMaxSize(8, { message: 'validation.productIds.maxSize' })
  productIds: string[];
}
