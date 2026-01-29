import { IsNotEmpty, IsOptional, IsInt, Min } from 'class-validator';
import { Transform } from 'class-transformer';

export class UpdateStockDto {
  @IsNotEmpty({ message: 'validation.stockQuantity.required' })
  @IsInt({ message: 'validation.stockQuantity.invalid' })
  @Min(0, { message: 'validation.stockQuantity.min' })
  @Transform(({ value }) => parseInt(value, 10))
  stockQuantity: number;

  @IsOptional()
  @IsInt({ message: 'validation.stockAlertThreshold.invalid' })
  @Min(0, { message: 'validation.stockAlertThreshold.min' })
  @Transform(({ value }) => (value !== undefined ? parseInt(value, 10) : undefined))
  stockAlertThreshold?: number;
}
