export interface ProductDeletedEvent {
  productId: string;
  sku: string;
  deletedAt: Date;
}
