import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrderStatus } from '@cyna-api/common';

export class UpdateOrderStatusDto {
  @ApiProperty({ enum: OrderStatus, description: 'New order status' })
  @IsEnum(OrderStatus)
  status: OrderStatus;

  @ApiPropertyOptional({ description: 'Optional admin notes about the status change' })
  @IsOptional()
  @IsString()
  notes?: string;
}
