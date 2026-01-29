import { IsNotEmpty, IsOptional, IsInt, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateStockDto {
  @ApiProperty({ description: 'New stock quantity' })
  @IsNotEmpty()
  @IsInt()
  @Min(0)
  stockQuantity: number;

  @ApiPropertyOptional({ description: 'Stock alert threshold' })
  @IsOptional()
  @IsInt()
  @Min(0)
  stockAlertThreshold?: number;
}
