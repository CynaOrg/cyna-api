import { IsArray, IsUUID, ArrayMinSize, ArrayMaxSize } from 'class-validator';

export class BulkDeleteProductsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  productIds!: string[];
}

export interface BulkDeleteProductsResult {
  deletedCount: number;
  failedIds: string[];
}
