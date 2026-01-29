import { Product, ProductType } from '../../entities';

export class StockResponseDto {
  productId: string;
  sku: string;
  productType: ProductType;
  stockQuantity: number;
  stockAlertThreshold: number;
  isLowStock: boolean;
  isAvailable: boolean;

  static fromEntity(product: Product): StockResponseDto {
    const dto = new StockResponseDto();
    dto.productId = product.id;
    dto.sku = product.sku;
    dto.productType = product.productType;
    dto.stockQuantity = product.stockQuantity ?? 0;
    dto.stockAlertThreshold = product.stockAlertThreshold;
    dto.isLowStock = dto.stockQuantity <= dto.stockAlertThreshold;
    dto.isAvailable = product.isAvailable;
    return dto;
  }

  static fromEntities(products: Product[]): StockResponseDto[] {
    return products.map((product) => StockResponseDto.fromEntity(product));
  }
}

export class StockCheckResponseDto {
  available: boolean;
  currentStock: number;
  requestedQuantity: number;
  productId: string;
  sku: string;

  static create(
    product: Product,
    requestedQuantity: number,
    available: boolean,
  ): StockCheckResponseDto {
    const dto = new StockCheckResponseDto();
    dto.available = available;
    dto.currentStock = product.stockQuantity ?? 0;
    dto.requestedQuantity = requestedQuantity;
    dto.productId = product.id;
    dto.sku = product.sku;
    return dto;
  }
}
