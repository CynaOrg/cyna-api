export interface StockLowEvent {
  productId: string;
  sku: string;
  productName: string;
  currentStock: number;
  alertThreshold: number;
  detectedAt: Date;
}
