import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, IsNull } from 'typeorm';
import { RpcException } from '@nestjs/microservices';
import {
  CynaLoggerService,
  CynaCacheService,
  CACHE_PREFIXES,
  CACHE_KEYS,
  generateCacheKey,
} from '@cyna-api/common';
import { Product, ProductType, StockReservation } from '../entities';
import {
  StockResponseDto,
  StockAvailabilityResponseDto,
  StockReservationResponseDto,
} from '../dto';
import { CatalogEventsPublisher, StockReleaseReason } from '../events';

@Injectable()
export class StockService {
  private readonly reservationExpiryMinutes: number;
  private readonly alertDefaultThreshold: number;

  constructor(
    @InjectRepository(Product)
    private readonly productRepository: Repository<Product>,
    @InjectRepository(StockReservation)
    private readonly reservationRepository: Repository<StockReservation>,
    private readonly logger: CynaLoggerService,
    private readonly eventsPublisher: CatalogEventsPublisher,
    private readonly configService: ConfigService,
    private readonly cacheService: CynaCacheService,
  ) {
    this.reservationExpiryMinutes = this.configService.get<number>(
      'catalog.stock.reservationExpiryMinutes',
      15,
    );
    this.alertDefaultThreshold = this.configService.get<number>(
      'catalog.stock.alertDefaultThreshold',
      10,
    );
  }

  async updateStock(
    productId: string,
    stockQuantity: number,
    stockAlertThreshold?: number,
  ): Promise<Product> {
    const product = await this.productRepository.findOne({
      where: { id: productId },
    });

    if (!product) {
      this.logger.warn(`Product not found: ${productId}`);
      throw new RpcException({
        statusCode: 404,
        message: 'Product not found',
        code: 'PRODUCT_NOT_FOUND',
      });
    }

    if (product.productType !== ProductType.PHYSICAL) {
      this.logger.warn(`Stock management not available for non-physical product: ${productId}`);
      throw new RpcException({
        statusCode: 400,
        message: 'Stock management is only available for physical products',
        code: 'STOCK_NOT_APPLICABLE',
      });
    }

    product.stockQuantity = stockQuantity;
    if (stockAlertThreshold !== undefined) {
      product.stockAlertThreshold = stockAlertThreshold;
    }

    await this.productRepository.save(product);
    this.logger.log(`Stock updated for product ${productId}: ${stockQuantity}`);

    await this.invalidateProductCache(product.id, product.slug);

    const threshold = product.stockAlertThreshold ?? 10;
    if (stockQuantity <= threshold) {
      await this.eventsPublisher.emitStockLow({
        productId: product.id,
        sku: product.sku,
        productName: product.nameEn || product.nameFr,
        currentStock: stockQuantity,
        alertThreshold: threshold,
        detectedAt: new Date(),
      });
    }

    return product;
  }

  async getStockInfo(productId: string): Promise<StockResponseDto> {
    const product = await this.productRepository.findOne({
      where: { id: productId },
    });

    if (!product) {
      this.logger.warn(`Product not found: ${productId}`);
      throw new RpcException({
        statusCode: 404,
        message: 'Product not found',
        code: 'PRODUCT_NOT_FOUND',
      });
    }

    const reservedQuantity = await this.getActiveReservedQuantity(productId);
    return StockResponseDto.fromEntity(product, reservedQuantity);
  }

  async getStockAlerts(): Promise<Product[]> {
    const products = await this.productRepository
      .createQueryBuilder('product')
      .where('product.productType = :type', { type: ProductType.PHYSICAL })
      .andWhere('product.stockQuantity <= product.stockAlertThreshold')
      .orderBy('product.stockQuantity', 'ASC')
      .getMany();

    return products;
  }

  async checkAvailability(
    productId: string,
    quantity: number,
  ): Promise<StockAvailabilityResponseDto> {
    const product = await this.productRepository.findOne({
      where: { id: productId },
    });

    if (!product) {
      this.logger.warn(`Product not found: ${productId}`);
      throw new RpcException({
        statusCode: 404,
        message: 'Product not found',
        code: 'PRODUCT_NOT_FOUND',
      });
    }

    const reservedQuantity = await this.getActiveReservedQuantity(productId);
    return StockAvailabilityResponseDto.create(product, quantity, reservedQuantity);
  }

  async reserveStock(
    productId: string,
    cartId: string,
    quantity: number,
    userId?: string,
  ): Promise<StockReservationResponseDto> {
    const product = await this.productRepository.findOne({
      where: { id: productId },
    });

    if (!product) {
      this.logger.warn(`Product not found: ${productId}`);
      throw new RpcException({
        statusCode: 404,
        message: 'Product not found',
        code: 'PRODUCT_NOT_FOUND',
      });
    }

    if (product.productType !== ProductType.PHYSICAL) {
      this.logger.warn(`Stock reservation not applicable for non-physical product: ${productId}`);
      throw new RpcException({
        statusCode: 400,
        message: 'Stock reservation is only available for physical products',
        code: 'STOCK_NOT_APPLICABLE',
      });
    }

    const existingReservation = await this.reservationRepository.findOne({
      where: {
        productId,
        cartId,
        confirmedAt: IsNull(),
        releasedAt: IsNull(),
      },
    });

    if (existingReservation) {
      existingReservation.quantity = quantity;
      existingReservation.expiresAt = this.getExpirationDate();
      await this.reservationRepository.save(existingReservation);
      this.logger.log(
        `Stock reservation updated for product ${productId}, cart ${cartId}: ${quantity}`,
      );
      return StockReservationResponseDto.fromEntity(existingReservation);
    }

    const reservedQuantity = await this.getActiveReservedQuantity(productId);
    const stockQuantity = product.stockQuantity ?? 0;
    const availableQuantity = stockQuantity - reservedQuantity;

    if (availableQuantity < quantity) {
      this.logger.warn(
        `Insufficient stock for reservation: product ${productId}, requested ${quantity}, available ${availableQuantity}`,
      );
      throw new RpcException({
        statusCode: 400,
        message: 'Insufficient stock for reservation',
        code: 'INSUFFICIENT_STOCK',
        details: {
          requested: quantity,
          available: availableQuantity,
        },
      });
    }

    const reservation = this.reservationRepository.create({
      productId,
      cartId,
      userId,
      quantity,
      expiresAt: this.getExpirationDate(),
    });

    await this.reservationRepository.save(reservation);
    this.logger.log(`Stock reserved for product ${productId}, cart ${cartId}: ${quantity}`);

    await this.eventsPublisher.emitStockReserved({
      reservationId: reservation.id,
      productId,
      cartId,
      userId,
      quantity,
      expiresAt: reservation.expiresAt,
      reservedAt: reservation.createdAt,
    });

    return StockReservationResponseDto.fromEntity(reservation);
  }

  async releaseReservation(
    cartId: string,
    reason: StockReleaseReason = StockReleaseReason.CANCELLED,
  ): Promise<void> {
    const reservations = await this.reservationRepository.find({
      where: {
        cartId,
        confirmedAt: IsNull(),
        releasedAt: IsNull(),
      },
    });

    if (reservations.length === 0) {
      this.logger.warn(`No active reservations found for cart: ${cartId}`);
      return;
    }

    const now = new Date();
    for (const reservation of reservations) {
      reservation.releasedAt = now;
    }

    const releasedData = reservations.map((r) => ({
      reservationId: r.id,
      productId: r.productId,
      quantity: r.quantity,
    }));

    await this.reservationRepository.remove(reservations);

    for (const data of releasedData) {
      await this.eventsPublisher.emitStockReleased({
        reservationId: data.reservationId,
        productId: data.productId,
        cartId,
        quantity: data.quantity,
        reason,
        releasedAt: now,
      });
    }

    this.logger.log(`Released ${releasedData.length} reservations for cart ${cartId}`);
  }

  async confirmReservation(cartId: string, orderId?: string): Promise<void> {
    const reservations = await this.reservationRepository.find({
      where: {
        cartId,
        confirmedAt: IsNull(),
        releasedAt: IsNull(),
      },
      relations: ['product'],
    });

    if (reservations.length === 0) {
      this.logger.warn(`No active reservations found for cart: ${cartId}`);
      throw new RpcException({
        statusCode: 404,
        message: 'No active reservations found for this cart',
        code: 'RESERVATIONS_NOT_FOUND',
      });
    }

    const now = new Date();

    for (const reservation of reservations) {
      const product = reservation.product;
      const previousStock = product.stockQuantity ?? 0;

      if (product.productType === ProductType.PHYSICAL) {
        product.stockQuantity = Math.max(0, previousStock - reservation.quantity);
        await this.productRepository.save(product);

        this.logger.log(
          `Stock decremented for product ${product.id}: ${previousStock} -> ${product.stockQuantity}`,
        );

        await this.eventsPublisher.emitStockConfirmed({
          reservationId: reservation.id,
          productId: product.id,
          orderId,
          quantity: reservation.quantity,
          previousStock,
          newStock: product.stockQuantity,
          confirmedAt: now,
        });

        if (product.stockQuantity <= (product.stockAlertThreshold ?? 10)) {
          await this.eventsPublisher.emitStockLow({
            productId: product.id,
            sku: product.sku,
            productName: product.nameEn || product.nameFr,
            currentStock: product.stockQuantity,
            alertThreshold: product.stockAlertThreshold ?? 10,
            detectedAt: now,
          });
        }
      }
    }

    await this.reservationRepository.remove(reservations);

    this.logger.log(`Confirmed ${reservations.length} reservations for cart ${cartId}`);
  }

  async cleanupExpiredReservations(): Promise<number> {
    const now = new Date();

    const expiredReservations = await this.reservationRepository.find({
      where: {
        expiresAt: LessThan(now),
        confirmedAt: IsNull(),
        releasedAt: IsNull(),
      },
    });

    if (expiredReservations.length === 0) {
      return 0;
    }

    await this.reservationRepository.remove(expiredReservations);

    for (const reservation of expiredReservations) {
      await this.eventsPublisher.emitStockReleased({
        reservationId: reservation.id,
        productId: reservation.productId,
        cartId: reservation.cartId,
        quantity: reservation.quantity,
        reason: StockReleaseReason.EXPIRED,
        releasedAt: now,
      });
    }

    this.logger.log(`Cleaned up ${expiredReservations.length} expired reservations`);

    return expiredReservations.length;
  }

  async getReservationsByCart(cartId: string): Promise<StockReservationResponseDto[]> {
    const reservations = await this.reservationRepository.find({
      where: {
        cartId,
        confirmedAt: IsNull(),
        releasedAt: IsNull(),
      },
      order: { createdAt: 'ASC' },
    });

    return reservations.map((r) => StockReservationResponseDto.fromEntity(r));
  }

  async getReservationsByProduct(productId: string): Promise<StockReservationResponseDto[]> {
    const reservations = await this.reservationRepository.find({
      where: {
        productId,
        confirmedAt: IsNull(),
        releasedAt: IsNull(),
      },
      order: { createdAt: 'ASC' },
    });

    return reservations.map((r) => StockReservationResponseDto.fromEntity(r));
  }

  private async getActiveReservedQuantity(productId: string): Promise<number> {
    const result = await this.reservationRepository
      .createQueryBuilder('reservation')
      .select('COALESCE(SUM(reservation.quantity), 0)', 'total')
      .where('reservation.productId = :productId', { productId })
      .andWhere('reservation.confirmedAt IS NULL')
      .andWhere('reservation.releasedAt IS NULL')
      .andWhere('reservation.expiresAt > :now', { now: new Date() })
      .getRawOne();

    return parseInt(result?.total ?? '0', 10);
  }

  private getExpirationDate(): Date {
    return new Date(Date.now() + this.reservationExpiryMinutes * 60 * 1000);
  }

  private async invalidateProductCache(id: string, slug: string): Promise<void> {
    await this.cacheService.delByPattern(`${CACHE_PREFIXES.PRODUCT}list:*`);
    await this.cacheService.delByPattern(`${CACHE_KEYS.PRODUCTS_FEATURED}*`);
    await this.cacheService.delByPattern(`${CACHE_KEYS.PRODUCTS_BY_CATEGORY}*`);
    await this.cacheService.del(generateCacheKey.productById(id));
    await this.cacheService.del(generateCacheKey.product(slug));
  }
}
