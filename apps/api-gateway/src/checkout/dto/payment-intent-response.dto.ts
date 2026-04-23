import { ApiProperty } from '@nestjs/swagger';

export class PaymentIntentResponseDto {
  @ApiProperty({ description: 'Stripe client secret used by the frontend to confirm the payment' })
  clientSecret: string;

  @ApiProperty({ description: 'Stripe PaymentIntent identifier' })
  paymentIntentId: string;

  @ApiProperty({ description: 'Internal order identifier (UUID)' })
  orderId: string;

  @ApiProperty({ description: 'Human-readable order number' })
  orderNumber: string;

  @ApiProperty({ description: 'Order total amount in the smallest currency unit' })
  amount: number;

  @ApiProperty({ description: 'ISO 4217 currency code', example: 'EUR' })
  currency: string;
}
