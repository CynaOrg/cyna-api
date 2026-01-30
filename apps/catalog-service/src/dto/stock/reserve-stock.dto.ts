import { IsNotEmpty, IsOptional, IsUUID, IsInt, Min } from 'class-validator';
import { Transform } from 'class-transformer';

export class ReserveStockDto {
  @IsNotEmpty({ message: 'validation.productId.required' })
  @IsUUID('4', { message: 'validation.productId.invalid' })
  productId: string;

  @IsNotEmpty({ message: 'validation.cartId.required' })
  @IsUUID('4', { message: 'validation.cartId.invalid' })
  cartId: string;

  @IsOptional()
  @IsUUID('4', { message: 'validation.userId.invalid' })
  userId?: string;

  @IsNotEmpty({ message: 'validation.quantity.required' })
  @IsInt({ message: 'validation.quantity.invalid' })
  @Min(1, { message: 'validation.quantity.min' })
  @Transform(({ value }) => parseInt(value, 10))
  quantity: number;
}
