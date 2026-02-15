import { IsArray, IsUUID, ArrayMinSize } from 'class-validator';

export class ReorderCarouselDto {
  @IsArray({ message: 'validation.slideIds.isArray' })
  @IsUUID('4', { each: true, message: 'validation.slideIds.isUUID' })
  @ArrayMinSize(1, { message: 'validation.slideIds.minSize' })
  slideIds: string[];
}
