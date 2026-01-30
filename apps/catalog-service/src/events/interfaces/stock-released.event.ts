export enum StockReleaseReason {
  EXPIRED = 'expired',
  CANCELLED = 'cancelled',
  CHECKOUT_FAILED = 'checkout_failed',
}

export interface StockReleasedEvent {
  reservationId: string;
  productId: string;
  cartId: string;
  quantity: number;
  reason: StockReleaseReason;
  releasedAt: Date;
}
