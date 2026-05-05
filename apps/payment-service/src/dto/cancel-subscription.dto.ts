import { IsUUID, IsBoolean, IsOptional } from 'class-validator';

export class CancelSubscriptionDto {
  @IsUUID()
  subscriptionId: string;

  /**
   * Owner check is enforced when `userId` is provided (user-initiated cancel).
   * Admin-initiated cancels (super_admin) omit `userId`, which bypasses the
   * ownership check intentionally.
   */
  @IsUUID()
  @IsOptional()
  userId?: string;

  @IsBoolean()
  @IsOptional()
  cancelAtPeriodEnd?: boolean = true;
}
