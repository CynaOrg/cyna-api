import { IsEnum, IsOptional, IsString, IsUrl } from 'class-validator';
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

  @ApiPropertyOptional({
    description: 'Carrier tracking number, typically provided when status becomes "shipped"',
    example: '1Z999AA10123456784',
  })
  @IsOptional()
  @IsString()
  trackingNumber?: string;

  @ApiPropertyOptional({
    description:
      'Public tracking URL for the shipment, typically provided when status becomes "shipped"',
    example: 'https://www.ups.com/track?tracknum=1Z999AA10123456784',
  })
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_tld: false })
  trackingUrl?: string;
}
