export interface ProductUpdatedEvent {
  productId: string;
  sku: string;
  updatedFields: string[];
  updatedAt: Date;
}
