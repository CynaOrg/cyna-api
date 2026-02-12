import { IsUUID, IsOptional, IsEmail, IsNumber, IsString } from 'class-validator';

export class CreatePaymentIntentDto {
  @IsUUID()
  orderId: string;

  @IsNumber()
  amount: number;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsUUID()
  @IsOptional()
  userId?: string;

  @IsEmail()
  @IsOptional()
  guestEmail?: string;
}
