/**
 * Subscription Status Enum
 * @see docs/Data_Model.md - SUBSCRIPTION entity
 */
export enum SubscriptionStatus {
  /**
   * Subscription was created on Stripe but the initial payment has not been
   * confirmed yet (Stripe `incomplete`). The row exists only to bridge the
   * call to `createSubscription` (which must hand back a `clientSecret`) and
   * the eventual `customer.subscription.updated` webhook that flips it to
   * ACTIVE. If the customer abandons the payment flow, the cron hard-deletes
   * the row after 24h — an unpaid subscription is never visible to the user
   * nor to the admin.
   */
  INCOMPLETE = 'incomplete',
  /** Active subscription */
  ACTIVE = 'active',
  /** Payment overdue */
  PAST_DUE = 'past_due',
  /** Subscription cancelled */
  CANCELLED = 'cancelled',
  /** Subscription unpaid */
  UNPAID = 'unpaid',
  /** Subscription paused */
  PAUSED = 'paused',
}
