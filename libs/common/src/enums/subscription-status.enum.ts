/**
 * Subscription Status Enum
 * @see docs/Data_Model.md - SUBSCRIPTION entity
 */
export enum SubscriptionStatus {
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
