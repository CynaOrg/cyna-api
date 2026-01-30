export interface StockConfirmedEvent {
  reservationId: string;
  productId: string;
  orderId?: string;
  quantity: number;
  previousStock: number;
  newStock: number;
  confirmedAt: Date;
}
