import { IsUUID, IsBoolean, IsIn } from 'class-validator';
import { FeaturedProductType } from '@cyna-api/common';

export class ToggleFeaturedDto {
  @IsUUID('4', { message: 'validation.productId.isUUID' })
  productId: string;

  @IsIn(['saas', 'physical'], { message: 'validation.productType.invalid' })
  productType: FeaturedProductType;

  @IsBoolean({ message: 'validation.featured.invalid' })
  featured: boolean;
}
