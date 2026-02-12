import { IsUUID, IsBoolean, IsOptional } from 'class-validator';

export class CancelSubscriptionDto {
  @IsUUID()
  subscriptionId: string;

  @IsUUID()
  userId: string;

  @IsBoolean()
  @IsOptional()
  cancelAtPeriodEnd?: boolean = true;
}
