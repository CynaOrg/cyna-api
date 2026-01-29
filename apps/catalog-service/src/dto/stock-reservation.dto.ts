import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsInt,
  IsUUID,
  IsArray,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { StockReservation } from '../entities';

/**
 * Item to reserve in a cart
 */
export class ReserveStockItemDto {
  @IsNotEmpty({ message: 'validation.uuid.invalid' })
  @IsUUID('4', { message: 'validation.uuid.invalid' })
  productId: string;

  @Type(() => Number)
  @IsInt({ message: 'validation.number.integer' })
  @Min(1, { message: 'validation.number.min' })
  quantity: number;
}

/**
 * Reserve Stock DTO
 * Called when user starts checkout
 */
export class ReserveStockDto {
  @IsNotEmpty({ message: 'validation.uuid.invalid' })
  @IsUUID('4', { message: 'validation.uuid.invalid' })
  cartId: string;

  @IsOptional()
  @IsUUID('4', { message: 'validation.uuid.invalid' })
  userId?: string;

  @IsNotEmpty()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReserveStockItemDto)
  items: ReserveStockItemDto[];
}

/**
 * Confirm Stock DTO
 * Called when payment succeeds
 */
export class ConfirmStockDto {
  @IsNotEmpty({ message: 'validation.uuid.invalid' })
  @IsUUID('4', { message: 'validation.uuid.invalid' })
  cartId: string;

  @IsOptional()
  @IsUUID('4', { message: 'validation.uuid.invalid' })
  orderId?: string;
}

/**
 * Release Stock DTO
 * Called when checkout is cancelled or payment fails
 */
export class ReleaseStockDto {
  @IsNotEmpty({ message: 'validation.uuid.invalid' })
  @IsUUID('4', { message: 'validation.uuid.invalid' })
  cartId: string;

  @IsOptional()
  @IsString()
  reason?: 'cancelled' | 'checkout_failed' | 'expired';
}

/**
 * Stock Reservation Response DTO
 */
export class StockReservationResponseDto {
  reservationId: string;
  productId: string;
  sku: string;
  productName: string;
  quantity: number;
  expiresAt: Date;
  createdAt: Date;

  static fromEntity(
    entity: StockReservation,
    productSku?: string,
    productName?: string,
  ): StockReservationResponseDto {
    const dto = new StockReservationResponseDto();
    dto.reservationId = entity.id;
    dto.productId = entity.productId;
    dto.sku = productSku || entity.product?.sku || '';
    dto.productName = productName || entity.product?.nameFr || '';
    dto.quantity = entity.quantity;
    dto.expiresAt = entity.expiresAt;
    dto.createdAt = entity.createdAt;
    return dto;
  }
}

/**
 * Reserve Stock Response DTO
 */
export class ReserveStockResponseDto {
  success: boolean;
  cartId: string;
  reservations: StockReservationResponseDto[];
  expiresAt: Date;
}

/**
 * Confirm Stock Response DTO
 */
export class ConfirmStockResponseDto {
  success: boolean;
  cartId: string;
  confirmedItems: {
    productId: string;
    quantity: number;
    newStockQuantity: number;
  }[];
}

/**
 * Release Stock Response DTO
 */
export class ReleaseStockResponseDto {
  success: boolean;
  cartId: string;
  releasedItems: {
    productId: string;
    quantity: number;
  }[];
  reason: string;
}
