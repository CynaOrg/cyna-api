import { Product, ProductType, StockReservation } from '../../entities';

export enum StockStatus {
  IN_STOCK = 'in_stock',
  LOW_STOCK = 'low_stock',
  OUT_OF_STOCK = 'out_of_stock',
  NOT_APPLICABLE = 'not_applicable',
}

export class StockResponseDto {
  productId: string;
  sku: string;
  productType: ProductType;
  stockQuantity: number;
  reservedQuantity: number;
  availableQuantity: number;
  stockAlertThreshold: number;
  isAvailable: boolean;
  stockStatus: StockStatus;

  static fromEntity(product: Product, reservedQuantity: number = 0): StockResponseDto {
    const dto = new StockResponseDto();
    dto.productId = product.id;
    dto.sku = product.sku;
    dto.productType = product.productType;

    if (product.productType !== ProductType.PHYSICAL) {
      dto.stockQuantity = -1;
      dto.reservedQuantity = 0;
      dto.availableQuantity = -1;
      dto.stockAlertThreshold = 0;
      dto.isAvailable = product.isAvailable;
      dto.stockStatus = StockStatus.NOT_APPLICABLE;
      return dto;
    }

    const stockQuantity = product.stockQuantity ?? 0;
    const availableQuantity = Math.max(0, stockQuantity - reservedQuantity);

    dto.stockQuantity = stockQuantity;
    dto.reservedQuantity = reservedQuantity;
    dto.availableQuantity = availableQuantity;
    dto.stockAlertThreshold = product.stockAlertThreshold;
    dto.isAvailable = product.isAvailable && availableQuantity > 0;

    if (availableQuantity === 0) {
      dto.stockStatus = StockStatus.OUT_OF_STOCK;
    } else if (availableQuantity <= product.stockAlertThreshold) {
      dto.stockStatus = StockStatus.LOW_STOCK;
    } else {
      dto.stockStatus = StockStatus.IN_STOCK;
    }

    return dto;
  }

  static fromEntities(products: Product[], reservations: Map<string, number>): StockResponseDto[] {
    return products.map((product) =>
      StockResponseDto.fromEntity(product, reservations.get(product.id) ?? 0),
    );
  }
}

export class StockAvailabilityResponseDto {
  productId: string;
  sku: string;
  available: boolean;
  requestedQuantity: number;
  availableQuantity: number;
  stockQuantity: number;
  reservedQuantity: number;

  static create(
    product: Product,
    requestedQuantity: number,
    reservedQuantity: number,
  ): StockAvailabilityResponseDto {
    const dto = new StockAvailabilityResponseDto();
    dto.productId = product.id;
    dto.sku = product.sku;
    dto.requestedQuantity = requestedQuantity;

    if (product.productType !== ProductType.PHYSICAL) {
      dto.available = true;
      dto.stockQuantity = -1;
      dto.reservedQuantity = 0;
      dto.availableQuantity = -1;
      return dto;
    }

    const stockQuantity = product.stockQuantity ?? 0;
    const availableQuantity = Math.max(0, stockQuantity - reservedQuantity);

    dto.stockQuantity = stockQuantity;
    dto.reservedQuantity = reservedQuantity;
    dto.availableQuantity = availableQuantity;
    dto.available = availableQuantity >= requestedQuantity;

    return dto;
  }
}

export class StockReservationResponseDto {
  id: string;
  productId: string;
  cartId: string;
  userId?: string;
  quantity: number;
  expiresAt: Date;
  createdAt: Date;

  static fromEntity(reservation: StockReservation): StockReservationResponseDto {
    const dto = new StockReservationResponseDto();
    dto.id = reservation.id;
    dto.productId = reservation.productId;
    dto.cartId = reservation.cartId;
    dto.userId = reservation.userId;
    dto.quantity = reservation.quantity;
    dto.expiresAt = reservation.expiresAt;
    dto.createdAt = reservation.createdAt;
    return dto;
  }
}
