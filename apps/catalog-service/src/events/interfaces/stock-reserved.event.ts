export interface StockReservedEvent {
  reservationId: string;
  productId: string;
  cartId: string;
  userId?: string;
  quantity: number;
  expiresAt: Date;
  reservedAt: Date;
}
