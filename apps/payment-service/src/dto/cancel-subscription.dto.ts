import { IsUUID, IsBoolean, IsOptional, IsIn } from 'class-validator';

/**
 * Discriminator for who initiated the cancel.
 * - 'user'  → ownership check against `userId` is mandatory (gateway always
 *             forces `userId: req.user.id` on the user-facing route).
 * - 'admin' → super_admin scope already enforced at the gateway via
 *             SuperAdminGuard; ownership check is intentionally skipped here.
 *
 * Defense-in-depth: requiring an explicit actor avoids the ambiguous
 * "absent userId == admin" pattern that could be exploited if the broker
 * were ever directly reachable.
 */
export type CancelSubscriptionActor = 'user' | 'admin';

export class CancelSubscriptionDto {
  @IsUUID()
  subscriptionId: string;

  @IsIn(['user', 'admin'])
  actor: CancelSubscriptionActor;

  /**
   * Required when `actor === 'user'`. Ignored when `actor === 'admin'`.
   */
  @IsUUID()
  @IsOptional()
  userId?: string;

  @IsBoolean()
  @IsOptional()
  cancelAtPeriodEnd?: boolean = true;
}
