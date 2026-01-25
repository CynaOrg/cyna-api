/**
 * Order Status Enum
 * @see docs/Data_Model.md - ORDER entity
 */
export enum OrderStatus {
  /** Waiting for payment */
  PENDING = 'pending',
  /** Payment received */
  PAID = 'paid',
  /** Being prepared */
  PROCESSING = 'processing',
  /** Shipped (physical products) */
  SHIPPED = 'shipped',
  /** Delivered (physical products) */
  DELIVERED = 'delivered',
  /** Order completed */
  COMPLETED = 'completed',
  /** Order cancelled */
  CANCELLED = 'cancelled',
  /** Order refunded */
  REFUNDED = 'refunded',
}
