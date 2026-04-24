import { IsArray, IsUUID, ArrayMinSize } from 'class-validator';

export class ReorderCategoriesDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  categoryIds: string[];
}
