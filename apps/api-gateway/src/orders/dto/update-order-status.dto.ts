import { IsEnum, IsOptional, IsString, IsUrl } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OrderStatus } from '@cyna-api/common';

// Treat blank submissions ('', '   ') as an explicit clear-to-null so admins
// can wipe a previously-set value from the back office.
const emptyToNull = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' && value.trim() === '' ? null : value;

export class UpdateOrderStatusDto {
  @ApiProperty({ enum: OrderStatus, description: 'New order status' })
  @IsEnum(OrderStatus)
  status: OrderStatus;

  @ApiPropertyOptional({ description: 'Optional admin notes about the status change' })
  @Transform(emptyToNull)
  @IsOptional()
  @IsString()
  notes?: string | null;

  @ApiPropertyOptional({
    description: 'Carrier tracking number, typically provided when status becomes "shipped"',
    example: '1Z999AA10123456784',
  })
  @Transform(emptyToNull)
  @IsOptional()
  @IsString()
  trackingNumber?: string | null;

  @ApiPropertyOptional({
    description:
      'Public tracking URL for the shipment, typically provided when status becomes "shipped"',
    example: 'https://www.ups.com/track?tracknum=1Z999AA10123456784',
  })
  @Transform(emptyToNull)
  @IsOptional()
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true, require_tld: false })
  trackingUrl?: string | null;
}
