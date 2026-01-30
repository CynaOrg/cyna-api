import { ProductType } from '../../entities';

export interface ProductCreatedEvent {
  productId: string;
  sku: string;
  name: string;
  productType: ProductType;
  categoryId: string;
  price: {
    monthly?: number;
    yearly?: number;
    unit?: number;
  };
  createdAt: Date;
}
