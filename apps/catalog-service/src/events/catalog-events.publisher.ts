import { Injectable, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { SERVICE_NAMES, EVENT_PATTERNS, CynaLoggerService } from '@cyna-api/common';
import {
  ProductCreatedEvent,
  ProductUpdatedEvent,
  ProductDeletedEvent,
  StockReservedEvent,
  StockReleasedEvent,
  StockConfirmedEvent,
  StockLowEvent,
} from './interfaces';

@Injectable()
export class CatalogEventsPublisher {
  constructor(
    @Inject(SERVICE_NAMES.NOTIFICATION)
    private readonly notificationClient: ClientProxy,
    @Inject(SERVICE_NAMES.ANALYTICS)
    private readonly analyticsClient: ClientProxy,
    private readonly logger: CynaLoggerService,
  ) {}

  // Product Events

  async emitProductCreated(data: ProductCreatedEvent): Promise<void> {
    try {
      this.notificationClient.emit(EVENT_PATTERNS.CATALOG.PRODUCT_CREATED, data);
      this.analyticsClient.emit(EVENT_PATTERNS.CATALOG.PRODUCT_CREATED, data);
      this.logger.log(
        `Emitted product.created event for product: ${data.productId}`,
        'CatalogEventsPublisher',
      );
    } catch (error) {
      this.logger.error(
        `Failed to emit product.created event: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error.stack : undefined,
        'CatalogEventsPublisher',
      );
    }
  }

  async emitProductUpdated(data: ProductUpdatedEvent): Promise<void> {
    try {
      this.notificationClient.emit(EVENT_PATTERNS.CATALOG.PRODUCT_UPDATED, data);
      this.analyticsClient.emit(EVENT_PATTERNS.CATALOG.PRODUCT_UPDATED, data);
      this.logger.log(
        `Emitted product.updated event for product: ${data.productId}`,
        'CatalogEventsPublisher',
      );
    } catch (error) {
      this.logger.error(
        `Failed to emit product.updated event: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error.stack : undefined,
        'CatalogEventsPublisher',
      );
    }
  }

  async emitProductDeleted(data: ProductDeletedEvent): Promise<void> {
    try {
      this.notificationClient.emit(EVENT_PATTERNS.CATALOG.PRODUCT_DELETED, data);
      this.analyticsClient.emit(EVENT_PATTERNS.CATALOG.PRODUCT_DELETED, data);
      this.logger.log(
        `Emitted product.deleted event for product: ${data.productId}`,
        'CatalogEventsPublisher',
      );
    } catch (error) {
      this.logger.error(
        `Failed to emit product.deleted event: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error.stack : undefined,
        'CatalogEventsPublisher',
      );
    }
  }

  // Stock Events

  async emitStockReserved(data: StockReservedEvent): Promise<void> {
    try {
      this.notificationClient.emit(EVENT_PATTERNS.CATALOG.STOCK_RESERVED, data);
      this.analyticsClient.emit(EVENT_PATTERNS.CATALOG.STOCK_RESERVED, data);
      this.logger.log(
        `Emitted stock.reserved event for reservation: ${data.reservationId}`,
        'CatalogEventsPublisher',
      );
    } catch (error) {
      this.logger.error(
        `Failed to emit stock.reserved event: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error.stack : undefined,
        'CatalogEventsPublisher',
      );
    }
  }

  async emitStockReleased(data: StockReleasedEvent): Promise<void> {
    try {
      this.notificationClient.emit(EVENT_PATTERNS.CATALOG.STOCK_RELEASED, data);
      this.analyticsClient.emit(EVENT_PATTERNS.CATALOG.STOCK_RELEASED, data);
      this.logger.log(
        `Emitted stock.released event for reservation: ${data.reservationId}`,
        'CatalogEventsPublisher',
      );
    } catch (error) {
      this.logger.error(
        `Failed to emit stock.released event: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error.stack : undefined,
        'CatalogEventsPublisher',
      );
    }
  }

  async emitStockConfirmed(data: StockConfirmedEvent): Promise<void> {
    try {
      this.notificationClient.emit(EVENT_PATTERNS.CATALOG.STOCK_CONFIRMED, data);
      this.analyticsClient.emit(EVENT_PATTERNS.CATALOG.STOCK_CONFIRMED, data);
      this.logger.log(
        `Emitted stock.confirmed event for reservation: ${data.reservationId}`,
        'CatalogEventsPublisher',
      );
    } catch (error) {
      this.logger.error(
        `Failed to emit stock.confirmed event: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error.stack : undefined,
        'CatalogEventsPublisher',
      );
    }
  }

  async emitStockLow(data: StockLowEvent): Promise<void> {
    try {
      this.notificationClient.emit(EVENT_PATTERNS.CATALOG.STOCK_LOW, data);
      this.analyticsClient.emit(EVENT_PATTERNS.CATALOG.STOCK_LOW, data);
      this.logger.log(
        `Emitted stock.low event for product: ${data.productId} (${data.currentStock} < ${data.alertThreshold})`,
        'CatalogEventsPublisher',
      );
    } catch (error) {
      this.logger.error(
        `Failed to emit stock.low event: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error instanceof Error ? error.stack : undefined,
        'CatalogEventsPublisher',
      );
    }
  }
}
