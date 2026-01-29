import { Injectable, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, LessThan, IsNull } from 'typeorm';
import { RpcException, ClientProxy } from '@nestjs/microservices';
import {
  CynaLoggerService,
  SERVICE_NAMES,
  EVENT_PATTERNS,
  ProductType,
} from '@cyna-api/common';
import { Product, StockReservation } from '../entities';
import {
  ReserveStockDto,
  ConfirmStockDto,
  ReleaseStockDto,
  ReserveStockResponseDto,
  ConfirmStockResponseDto,
  ReleaseStockResponseDto,
  StockReservationResponseDto,
} from '../dto';

/**
 * Default reservation expiration time in minutes
 */
const DEFAULT_RESERVATION_MINUTES = 15;

@Injectable()
export class StockReservationService {
  constructor(
    @InjectRepository(StockReservation)
    private readonly reservationRepository: Repository<StockReservation>,
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @Inject(SERVICE_NAMES.NOTIFICATION)
    private readonly notificationClient: ClientProxy,
    @Inject(SERVICE_NAMES.ANALYTICS)
    private readonly analyticsClient: ClientProxy,
    private readonly logger: CynaLoggerService,
  ) {
    this.logger.setContext('StockReservationService');
  }

  /**
   * Reserve stock for cart items during checkout
   * Creates reservations with expiration time
   */
  async reserveStock(dto: ReserveStockDto): Promise<ReserveStockResponseDto> {
    const { cartId, userId, items } = dto;

    this.logger.log(`Reserving stock for cart ${cartId} with ${items.length} items`);

    // First, release any existing reservations for this cart
    await this.releaseExistingReservations(cartId, 'checkout_failed');

    // Validate all products exist and are physical
    const productIds = items.map((item) => item.productId);
    const products = await this.productRepository.find({
      where: { id: In(productIds) },
    });

    const productMap = new Map(products.map((p) => [p.id, p]));

    // Validate products
    for (const item of items) {
      const product = productMap.get(item.productId);
      if (!product) {
        throw new RpcException({
          statusCode: 404,
          message: `Product ${item.productId} not found`,
          code: 'PRODUCT_NOT_FOUND',
        });
      }

      if (product.productType !== ProductType.PHYSICAL) {
        throw new RpcException({
          statusCode: 400,
          message: `Product ${product.sku} is not a physical product and does not require stock reservation`,
          code: 'INVALID_PRODUCT_TYPE',
        });
      }

      if (!product.isAvailable) {
        throw new RpcException({
          statusCode: 400,
          message: `Product ${product.sku} is not available`,
          code: 'PRODUCT_UNAVAILABLE',
        });
      }
    }

    // Calculate available stock for each product (considering active reservations)
    const reservedQuantities = await this.getReservedQuantities(productIds);

    // Check stock availability
    for (const item of items) {
      const product = productMap.get(item.productId)!;
      const reservedQty = reservedQuantities.get(item.productId) || 0;
      const availableQty = (product.stockQuantity || 0) - reservedQty;

      if (availableQty < item.quantity) {
        throw new RpcException({
          statusCode: 400,
          message: `Insufficient stock for ${product.sku}. Available: ${availableQty}, Requested: ${item.quantity}`,
          code: 'INSUFFICIENT_STOCK',
        });
      }
    }

    // Create reservations
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + DEFAULT_RESERVATION_MINUTES);

    const reservations: StockReservation[] = [];

    for (const item of items) {
      const reservation = this.reservationRepository.create({
        productId: item.productId,
        cartId,
        userId,
        quantity: item.quantity,
        expiresAt,
      });
      reservations.push(reservation);
    }

    const savedReservations = await this.reservationRepository.save(reservations);

    this.logger.log(`Created ${savedReservations.length} reservations for cart ${cartId}`);

    // Emit stock.reserved event
    this.emitStockReservedEvent(cartId, userId, savedReservations, products);

    // Check for low stock alerts
    await this.checkLowStockAlerts(productIds, productMap, reservedQuantities, items);

    return {
      success: true,
      cartId,
      reservations: savedReservations.map((r) => {
        const product = productMap.get(r.productId)!;
        return StockReservationResponseDto.fromEntity(r, product.sku, product.nameFr);
      }),
      expiresAt,
    };
  }

  /**
   * Release stock reservations (cart abandoned, checkout failed, etc.)
   */
  async releaseStock(dto: ReleaseStockDto): Promise<ReleaseStockResponseDto> {
    const { cartId, reason = 'cancelled' } = dto;

    this.logger.log(`Releasing stock reservations for cart ${cartId}, reason: ${reason}`);

    // Find active reservations for this cart
    const reservations = await this.reservationRepository.find({
      where: {
        cartId,
        confirmedAt: IsNull(),
        releasedAt: IsNull(),
      },
      relations: ['product'],
    });

    if (reservations.length === 0) {
      this.logger.log(`No active reservations found for cart ${cartId}`);
      return {
        success: true,
        cartId,
        releasedItems: [],
        reason,
      };
    }

    // Mark reservations as released
    const now = new Date();
    for (const reservation of reservations) {
      reservation.releasedAt = now;
    }

    await this.reservationRepository.save(reservations);

    this.logger.log(`Released ${reservations.length} reservations for cart ${cartId}`);

    // Emit stock.released event
    this.emitStockReleasedEvent(cartId, reservations, reason);

    return {
      success: true,
      cartId,
      releasedItems: reservations.map((r) => ({
        productId: r.productId,
        quantity: r.quantity,
      })),
      reason,
    };
  }

  /**
   * Confirm stock reservations (payment successful)
   * Decrements actual stock quantity
   */
  async confirmStock(dto: ConfirmStockDto): Promise<ConfirmStockResponseDto> {
    const { cartId, orderId } = dto;

    this.logger.log(`Confirming stock reservations for cart ${cartId}, order: ${orderId}`);

    // Find active reservations for this cart
    const reservations = await this.reservationRepository.find({
      where: {
        cartId,
        confirmedAt: IsNull(),
        releasedAt: IsNull(),
      },
      relations: ['product'],
    });

    if (reservations.length === 0) {
      this.logger.warn(`No active reservations found for cart ${cartId}`);
      throw new RpcException({
        statusCode: 404,
        message: 'No active reservations found for this cart',
        code: 'RESERVATIONS_NOT_FOUND',
      });
    }

    // Check if any reservations have expired
    const now = new Date();
    const expiredReservations = reservations.filter((r) => r.isExpired());
    if (expiredReservations.length > 0) {
      this.logger.warn(`Found ${expiredReservations.length} expired reservations for cart ${cartId}`);
      throw new RpcException({
        statusCode: 400,
        message: 'Some reservations have expired. Please restart checkout.',
        code: 'RESERVATIONS_EXPIRED',
      });
    }

    const confirmedItems: ConfirmStockResponseDto['confirmedItems'] = [];

    // Confirm reservations and decrement stock
    for (const reservation of reservations) {
      reservation.confirmedAt = now;

      // Decrement actual stock
      const product = reservation.product;
      const previousStock = product.stockQuantity || 0;
      product.stockQuantity = Math.max(0, previousStock - reservation.quantity);

      await this.productRepository.save(product);

      confirmedItems.push({
        productId: reservation.productId,
        quantity: reservation.quantity,
        newStockQuantity: product.stockQuantity,
      });

      this.logger.log(
        `Confirmed reservation for ${product.sku}: stock ${previousStock} -> ${product.stockQuantity}`,
      );
    }

    await this.reservationRepository.save(reservations);

    this.logger.log(`Confirmed ${reservations.length} reservations for cart ${cartId}`);

    // Emit stock.confirmed event
    this.emitStockConfirmedEvent(cartId, orderId, confirmedItems);

    // Check for low stock alerts after confirmation
    const productIds = reservations.map((r) => r.productId);
    const products = reservations.map((r) => r.product);
    const productMap = new Map(products.map((p) => [p.id, p]));
    await this.checkLowStockAlertsAfterConfirmation(productIds, productMap);

    return {
      success: true,
      cartId,
      confirmedItems,
    };
  }

  /**
   * Get active reservations (admin endpoint)
   */
  async getActiveReservations(options?: {
    productId?: string;
    userId?: string;
    cartId?: string;
  }): Promise<StockReservation[]> {
    const queryBuilder = this.reservationRepository
      .createQueryBuilder('reservation')
      .leftJoinAndSelect('reservation.product', 'product')
      .where('reservation.confirmed_at IS NULL')
      .andWhere('reservation.released_at IS NULL')
      .andWhere('reservation.expires_at > :now', { now: new Date() });

    if (options?.productId) {
      queryBuilder.andWhere('reservation.product_id = :productId', {
        productId: options.productId,
      });
    }

    if (options?.userId) {
      queryBuilder.andWhere('reservation.user_id = :userId', {
        userId: options.userId,
      });
    }

    if (options?.cartId) {
      queryBuilder.andWhere('reservation.cart_id = :cartId', {
        cartId: options.cartId,
      });
    }

    queryBuilder.orderBy('reservation.created_at', 'DESC');

    return queryBuilder.getMany();
  }

  /**
   * Get reserved quantity for a product (used by ProductService.getStock)
   */
  async getReservedQuantityForProduct(productId: string): Promise<number> {
    const result = await this.reservationRepository
      .createQueryBuilder('reservation')
      .select('SUM(reservation.quantity)', 'total')
      .where('reservation.product_id = :productId', { productId })
      .andWhere('reservation.confirmed_at IS NULL')
      .andWhere('reservation.released_at IS NULL')
      .andWhere('reservation.expires_at > :now', { now: new Date() })
      .getRawOne();

    return parseInt(result?.total || '0', 10);
  }

  /**
   * Clean up expired reservations (called by cron job)
   */
  async cleanupExpiredReservations(): Promise<number> {
    const now = new Date();

    // Find expired reservations that haven't been released yet
    const expiredReservations = await this.reservationRepository.find({
      where: {
        expiresAt: LessThan(now),
        confirmedAt: IsNull(),
        releasedAt: IsNull(),
      },
      relations: ['product'],
    });

    if (expiredReservations.length === 0) {
      return 0;
    }

    this.logger.log(`Found ${expiredReservations.length} expired reservations to clean up`);

    // Group by cartId for batch processing
    const cartGroups = new Map<string, StockReservation[]>();
    for (const reservation of expiredReservations) {
      const existing = cartGroups.get(reservation.cartId) || [];
      existing.push(reservation);
      cartGroups.set(reservation.cartId, existing);
    }

    // Mark all as released
    for (const reservation of expiredReservations) {
      reservation.releasedAt = now;
    }

    await this.reservationRepository.save(expiredReservations);

    // Emit events for each cart
    for (const [cartId, reservations] of cartGroups) {
      this.emitStockReleasedEvent(cartId, reservations, 'expired');
    }

    this.logger.log(`Cleaned up ${expiredReservations.length} expired reservations`);

    return expiredReservations.length;
  }

  // ==================== Private Helper Methods ====================

  private async releaseExistingReservations(
    cartId: string,
    reason: string,
  ): Promise<void> {
    const existing = await this.reservationRepository.find({
      where: {
        cartId,
        confirmedAt: IsNull(),
        releasedAt: IsNull(),
      },
    });

    if (existing.length > 0) {
      const now = new Date();
      for (const reservation of existing) {
        reservation.releasedAt = now;
      }
      await this.reservationRepository.save(existing);
      this.logger.log(`Released ${existing.length} existing reservations for cart ${cartId}`);
    }
  }

  private async getReservedQuantities(
    productIds: string[],
  ): Promise<Map<string, number>> {
    const result = await this.reservationRepository
      .createQueryBuilder('reservation')
      .select('reservation.product_id', 'productId')
      .addSelect('SUM(reservation.quantity)', 'total')
      .where('reservation.product_id IN (:...productIds)', { productIds })
      .andWhere('reservation.confirmed_at IS NULL')
      .andWhere('reservation.released_at IS NULL')
      .andWhere('reservation.expires_at > :now', { now: new Date() })
      .groupBy('reservation.product_id')
      .getRawMany();

    return new Map(result.map((r) => [r.productId, parseInt(r.total, 10)]));
  }

  private async checkLowStockAlerts(
    productIds: string[],
    productMap: Map<string, Product>,
    reservedQuantities: Map<string, number>,
    items: { productId: string; quantity: number }[],
  ): Promise<void> {
    for (const item of items) {
      const product = productMap.get(item.productId)!;
      const previousReserved = reservedQuantities.get(item.productId) || 0;
      const newReserved = previousReserved + item.quantity;
      const availableAfter = (product.stockQuantity || 0) - newReserved;

      if (availableAfter <= product.stockAlertThreshold) {
        this.emitLowStockEvent(product, availableAfter);
      }
    }
  }

  private async checkLowStockAlertsAfterConfirmation(
    productIds: string[],
    productMap: Map<string, Product>,
  ): Promise<void> {
    for (const productId of productIds) {
      const product = productMap.get(productId);
      if (!product) continue;

      const reservedQty = await this.getReservedQuantityForProduct(productId);
      const availableQty = (product.stockQuantity || 0) - reservedQty;

      if (availableQty <= product.stockAlertThreshold) {
        this.emitLowStockEvent(product, availableQty);
      }
    }
  }

  private emitStockReservedEvent(
    cartId: string,
    userId: string | undefined,
    reservations: StockReservation[],
    products: Product[],
  ): void {
    const productMap = new Map(products.map((p) => [p.id, p]));

    this.analyticsClient.emit(EVENT_PATTERNS.CATALOG.STOCK_RESERVED, {
      cartId,
      userId,
      reservations: reservations.map((r) => ({
        reservationId: r.id,
        productId: r.productId,
        sku: productMap.get(r.productId)?.sku,
        quantity: r.quantity,
        expiresAt: r.expiresAt,
      })),
      timestamp: new Date().toISOString(),
    });
  }

  private emitStockReleasedEvent(
    cartId: string,
    reservations: StockReservation[],
    reason: string,
  ): void {
    this.analyticsClient.emit(EVENT_PATTERNS.CATALOG.STOCK_RELEASED, {
      cartId,
      reason,
      releasedItems: reservations.map((r) => ({
        reservationId: r.id,
        productId: r.productId,
        sku: r.product?.sku,
        quantity: r.quantity,
      })),
      timestamp: new Date().toISOString(),
    });
  }

  private emitStockConfirmedEvent(
    cartId: string,
    orderId: string | undefined,
    confirmedItems: ConfirmStockResponseDto['confirmedItems'],
  ): void {
    this.analyticsClient.emit(EVENT_PATTERNS.CATALOG.STOCK_CONFIRMED, {
      cartId,
      orderId,
      confirmedItems,
      timestamp: new Date().toISOString(),
    });
  }

  private emitLowStockEvent(product: Product, availableQuantity: number): void {
    this.logger.warn(
      `Low stock alert for ${product.sku}: ${availableQuantity} available (threshold: ${product.stockAlertThreshold})`,
    );

    // Emit to notification service for admin alerts
    this.notificationClient.emit(EVENT_PATTERNS.CATALOG.STOCK_LOW, {
      productId: product.id,
      sku: product.sku,
      productName: product.nameFr,
      stockQuantity: product.stockQuantity,
      availableQuantity,
      stockAlertThreshold: product.stockAlertThreshold,
      timestamp: new Date().toISOString(),
    });

    // Emit to analytics service
    this.analyticsClient.emit(EVENT_PATTERNS.CATALOG.STOCK_LOW, {
      productId: product.id,
      sku: product.sku,
      availableQuantity,
      stockAlertThreshold: product.stockAlertThreshold,
      timestamp: new Date().toISOString(),
    });
  }
}
