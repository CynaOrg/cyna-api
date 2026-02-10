/**
 * Billing Period Enum
 * @see docs/Data_Model.md - ORDER_ITEM, SUBSCRIPTION entities
 */
export enum BillingPeriod {
  /** Monthly subscription */
  MONTHLY = 'monthly',
  /** Yearly subscription */
  YEARLY = 'yearly',
  /** One-time purchase (physical, license) */
  ONE_TIME = 'one_time',
}
