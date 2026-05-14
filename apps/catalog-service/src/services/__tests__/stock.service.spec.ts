import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder, IsNull } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { StockService } from '../stock.service';
import { Product, ProductType, StockReservation } from '../../entities';
import { StockStatus } from '../../dto';
import { CatalogEventsPublisher, StockReleaseReason } from '../../events';
import { CynaCacheService, CynaLoggerService } from '@cyna-api/common';

// Logger mock
const mockLogger = {
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

// Cache mock (StockService relies on CynaCacheService to invalidate/read counters)
const mockCacheService = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  delByPattern: jest.fn(),
  getOrSet: jest.fn(),
  invalidateDomain: jest.fn(),
  reset: jest.fn(),
};

// Event publisher mock
const mockEventsPublisher = {
  emitStockReserved: jest.fn(),
  emitStockReleased: jest.fn(),
  emitStockConfirmed: jest.fn(),
  emitStockLow: jest.fn(),
};

// Config service mock
const mockConfigService = {
  get: jest.fn((key: string, defaultValue: number) => {
    if (key === 'catalog.stock.reservationExpiryMinutes') return 15;
    if (key === 'catalog.stock.alertDefaultThreshold') return 10;
    return defaultValue;
  }),
};

// Fixture: base product used across tests
const createMockProduct = (overrides: Partial<Product> = {}): Product => ({
  id: 'prod-uuid-001',
  categoryId: 'cat-uuid-001',
  slug: 'hardware-001',
  sku: 'HW-001',
  nameFr: 'Hardware',
  nameEn: 'Hardware',
  descriptionFr: 'Description FR',
  descriptionEn: 'Description EN',
  productType: ProductType.PHYSICAL,
  stockQuantity: 100,
  stockAlertThreshold: 10,
  isAvailable: true,
  isFeatured: false,
  displayOrder: 0,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  category: {} as unknown as import('../../entities').Category,
  images: [],
  characteristics: [],
  stockReservations: [],
  ...overrides,
});

// Fixture: stock reservation for tests
const createMockReservation = (overrides: Partial<StockReservation> = {}): StockReservation => ({
  id: 'res-uuid-001',
  productId: 'prod-uuid-001',
  cartId: 'cart-uuid-001',
  userId: 'user-uuid-001',
  quantity: 5,
  expiresAt: new Date(Date.now() + 15 * 60 * 1000),
  createdAt: new Date('2024-01-01'),
  product: {} as Product,
  ...overrides,
});

// StockService tests (CRITICAL)
describe('StockService', () => {
  let service: StockService;
  let productRepository: jest.Mocked<Repository<Product>>;
  let reservationRepository: jest.Mocked<Repository<StockReservation>>;
  let productQueryBuilder: jest.Mocked<SelectQueryBuilder<Product>>;
  let reservationQueryBuilder: jest.Mocked<SelectQueryBuilder<StockReservation>>;

  beforeEach(async () => {
    // QueryBuilder mock for products
    productQueryBuilder = {
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      getMany: jest.fn(),
    } as unknown as jest.Mocked<SelectQueryBuilder<Product>>;

    // QueryBuilder mock for reservations
    reservationQueryBuilder = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawOne: jest.fn(),
    } as unknown as jest.Mocked<SelectQueryBuilder<StockReservation>>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StockService,
        {
          provide: getRepositoryToken(Product),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
            createQueryBuilder: jest.fn().mockReturnValue(productQueryBuilder),
          },
        },
        {
          provide: getRepositoryToken(StockReservation),
          useValue: {
            findOne: jest.fn(),
            find: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            remove: jest.fn(),
            createQueryBuilder: jest.fn().mockReturnValue(reservationQueryBuilder),
          },
        },
        {
          provide: CynaLoggerService,
          useValue: mockLogger,
        },
        {
          provide: CatalogEventsPublisher,
          useValue: mockEventsPublisher,
        },
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: CynaCacheService,
          useValue: mockCacheService,
        },
      ],
    }).compile();

    service = module.get<StockService>(StockService);
    productRepository = module.get(getRepositoryToken(Product));
    reservationRepository = module.get(getRepositoryToken(StockReservation));
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // ==================== STOCK MANAGEMENT ====================
  describe('Stock Management', () => {
    // updateStock tests
    describe('updateStock()', () => {
      // Verifies stock update for a physical product
      it('should update stock for physical product', async () => {
        const product = createMockProduct({ stockQuantity: 50 });

        productRepository.findOne.mockResolvedValue(product);
        productRepository.save.mockResolvedValue({ ...product, stockQuantity: 100 });

        const result = await service.updateStock('prod-uuid-001', 100);

        expect(productRepository.save).toHaveBeenCalledWith(
          expect.objectContaining({ stockQuantity: 100 }),
        );
        expect(result.stockQuantity).toBe(100);
      });

      // Verifies the threshold is updated together with stock
      it('should update stockAlertThreshold if provided', async () => {
        const product = createMockProduct();

        productRepository.findOne.mockResolvedValue(product);
        productRepository.save.mockResolvedValue({
          ...product,
          stockQuantity: 100,
          stockAlertThreshold: 20,
        });

        await service.updateStock('prod-uuid-001', 100, 20);

        expect(productRepository.save).toHaveBeenCalledWith(
          expect.objectContaining({
            stockQuantity: 100,
            stockAlertThreshold: 20,
          }),
        );
      });

      // Verifies an error is thrown when the product is not physical
      it('should throw error if product is not physical', async () => {
        const product = createMockProduct({ productType: ProductType.SAAS });

        productRepository.findOne.mockResolvedValue(product);

        await expect(service.updateStock('prod-uuid-001', 100)).rejects.toMatchObject({
          error: expect.objectContaining({
            statusCode: 400,
            code: 'STOCK_NOT_APPLICABLE',
          }),
        });
      });

      // Verifies a stock_low event is emitted when stock is low
      it('should emit stock_low event if stock is below threshold', async () => {
        const product = createMockProduct({ stockQuantity: 100, stockAlertThreshold: 10 });

        productRepository.findOne.mockResolvedValue(product);
        productRepository.save.mockResolvedValue({ ...product, stockQuantity: 5 });

        await service.updateStock('prod-uuid-001', 5);

        expect(mockEventsPublisher.emitStockLow).toHaveBeenCalledWith(
          expect.objectContaining({
            productId: 'prod-uuid-001',
            currentStock: 5,
            alertThreshold: 10,
          }),
        );
      });
    });

    // getStockInfo tests
    describe('getStockInfo()', () => {
      // Verifies stock info is returned correctly
      it('should return stockQuantity, reservedQuantity, availableQuantity', async () => {
        const product = createMockProduct({ stockQuantity: 100 });

        productRepository.findOne.mockResolvedValue(product);
        reservationQueryBuilder.getRawOne.mockResolvedValue({ total: '20' });

        const result = await service.getStockInfo('prod-uuid-001');

        expect(result.stockQuantity).toBe(100);
        expect(result.reservedQuantity).toBe(20);
        expect(result.availableQuantity).toBe(80);
      });

      // Verifies availableQuantity is computed correctly when active reservations exist
      it('should calculate availableQuantity correctly with active reservations', async () => {
        const product = createMockProduct({ stockQuantity: 50 });

        productRepository.findOne.mockResolvedValue(product);
        reservationQueryBuilder.getRawOne.mockResolvedValue({ total: '30' });

        const result = await service.getStockInfo('prod-uuid-001');

        expect(result.availableQuantity).toBe(20);
      });

      // Verifies the proper stockStatus: in_stock
      it('should return stockStatus in_stock when stock is sufficient', async () => {
        const product = createMockProduct({ stockQuantity: 100, stockAlertThreshold: 10 });

        productRepository.findOne.mockResolvedValue(product);
        reservationQueryBuilder.getRawOne.mockResolvedValue({ total: '0' });

        const result = await service.getStockInfo('prod-uuid-001');

        expect(result.stockStatus).toBe(StockStatus.IN_STOCK);
      });

      // Verifies the proper stockStatus: low_stock
      it('should return stockStatus low_stock when stock is at or below threshold', async () => {
        const product = createMockProduct({ stockQuantity: 10, stockAlertThreshold: 10 });

        productRepository.findOne.mockResolvedValue(product);
        reservationQueryBuilder.getRawOne.mockResolvedValue({ total: '0' });

        const result = await service.getStockInfo('prod-uuid-001');

        expect(result.stockStatus).toBe(StockStatus.LOW_STOCK);
      });

      // Verifies the proper stockStatus: out_of_stock
      it('should return stockStatus out_of_stock when available is 0', async () => {
        const product = createMockProduct({ stockQuantity: 20 });

        productRepository.findOne.mockResolvedValue(product);
        reservationQueryBuilder.getRawOne.mockResolvedValue({ total: '20' });

        const result = await service.getStockInfo('prod-uuid-001');

        expect(result.stockStatus).toBe(StockStatus.OUT_OF_STOCK);
      });

      // Verifies not_applicable is returned for non-physical products
      it('should return NOT_APPLICABLE for non-physical products', async () => {
        const product = createMockProduct({ productType: ProductType.SAAS });

        productRepository.findOne.mockResolvedValue(product);

        const result = await service.getStockInfo('prod-uuid-001');

        expect(result.stockStatus).toBe(StockStatus.NOT_APPLICABLE);
        expect(result.stockQuantity).toBe(-1);
      });
    });

    // getStockAlerts tests
    describe('getStockAlerts()', () => {
      // Verifies products with stock <= threshold are returned
      it('should return products where stock <= threshold', async () => {
        const lowStockProducts = [
          createMockProduct({ stockQuantity: 5, stockAlertThreshold: 10 }),
          createMockProduct({ id: 'prod-002', stockQuantity: 8, stockAlertThreshold: 10 }),
        ];

        productQueryBuilder.getMany.mockResolvedValue(lowStockProducts);

        const result = await service.getStockAlerts();

        expect(productQueryBuilder.where).toHaveBeenCalledWith('product.productType = :type', {
          type: ProductType.PHYSICAL,
        });
        expect(productQueryBuilder.andWhere).toHaveBeenCalledWith(
          'product.stockQuantity <= product.stockAlertThreshold',
        );
        expect(result).toHaveLength(2);
      });
    });

    // checkAvailability tests
    describe('checkAvailability()', () => {
      // Verifies true is returned when stock is sufficient
      it('should return available true if stock is sufficient', async () => {
        const product = createMockProduct({ stockQuantity: 100 });

        productRepository.findOne.mockResolvedValue(product);
        reservationQueryBuilder.getRawOne.mockResolvedValue({ total: '20' });

        const result = await service.checkAvailability('prod-uuid-001', 50);

        expect(result.available).toBe(true);
        expect(result.requestedQuantity).toBe(50);
        expect(result.availableQuantity).toBe(80);
      });

      // Verifies false is returned when stock is insufficient (including reservations)
      it('should return available false if stock insufficient (including reservations)', async () => {
        const product = createMockProduct({ stockQuantity: 50 });

        productRepository.findOne.mockResolvedValue(product);
        reservationQueryBuilder.getRawOne.mockResolvedValue({ total: '40' });

        const result = await service.checkAvailability('prod-uuid-001', 20);

        expect(result.available).toBe(false);
        expect(result.availableQuantity).toBe(10);
      });
    });
  });

  // ==================== RESERVATIONS (CRITICAL) ====================
  describe('Stock Reservations', () => {
    // reserveStock tests
    describe('reserveStock()', () => {
      // Verifies a reservation is created with 15 min expiry
      it('should create a reservation with 15 minute expiration', async () => {
        const product = createMockProduct({ stockQuantity: 100 });
        const newReservation = createMockReservation();

        productRepository.findOne.mockResolvedValue(product);
        reservationRepository.findOne.mockResolvedValue(null);
        reservationQueryBuilder.getRawOne.mockResolvedValue({ total: '0' });
        reservationRepository.create.mockReturnValue(newReservation);
        reservationRepository.save.mockResolvedValue(newReservation);

        const result = await service.reserveStock('prod-uuid-001', 'cart-uuid-001', 5);

        expect(reservationRepository.create).toHaveBeenCalledWith(
          expect.objectContaining({
            productId: 'prod-uuid-001',
            cartId: 'cart-uuid-001',
            quantity: 5,
          }),
        );
        expect(result.quantity).toBe(5);
        expect(mockEventsPublisher.emitStockReserved).toHaveBeenCalled();
      });

      // Verifies an error is thrown when stock is insufficient
      it('should throw INSUFFICIENT_STOCK if stock is insufficient', async () => {
        const product = createMockProduct({ stockQuantity: 10 });

        productRepository.findOne.mockResolvedValue(product);
        reservationRepository.findOne.mockResolvedValue(null);
        reservationQueryBuilder.getRawOne.mockResolvedValue({ total: '8' });

        await expect(
          service.reserveStock('prod-uuid-001', 'cart-uuid-001', 5),
        ).rejects.toMatchObject({
          error: expect.objectContaining({
            statusCode: 400,
            code: 'INSUFFICIENT_STOCK',
          }),
        });
      });

      // Verifies an error is thrown when the product is not physical
      it('should throw error if product is not physical', async () => {
        const product = createMockProduct({ productType: ProductType.LICENSE });

        productRepository.findOne.mockResolvedValue(product);

        await expect(
          service.reserveStock('prod-uuid-001', 'cart-uuid-001', 5),
        ).rejects.toMatchObject({
          error: expect.objectContaining({
            statusCode: 400,
            code: 'STOCK_NOT_APPLICABLE',
          }),
        });
      });

      // Verifies update of an existing reservation for the same cart
      it('should update existing reservation for same cart', async () => {
        const product = createMockProduct({ stockQuantity: 100 });
        const existingReservation = createMockReservation({ quantity: 3 });
        const updatedReservation = { ...existingReservation, quantity: 5 };

        productRepository.findOne.mockResolvedValue(product);
        reservationRepository.findOne.mockResolvedValue(existingReservation);
        reservationRepository.save.mockResolvedValue(updatedReservation);

        await service.reserveStock('prod-uuid-001', 'cart-uuid-001', 5);

        expect(reservationRepository.save).toHaveBeenCalledWith(
          expect.objectContaining({ quantity: 5 }),
        );
        expect(reservationRepository.create).not.toHaveBeenCalled();
      });
    });

    // releaseReservation tests
    describe('releaseReservation()', () => {
      // Verifies all reservations of a cart are released
      it('should release all reservations for a cart', async () => {
        const reservations = [
          createMockReservation({ id: 'res-001' }),
          createMockReservation({ id: 'res-002', productId: 'prod-002' }),
        ];

        reservationRepository.find.mockResolvedValue(reservations);
        reservationRepository.remove.mockResolvedValue(reservations as unknown as StockReservation);

        await service.releaseReservation('cart-uuid-001');

        expect(reservationRepository.remove).toHaveBeenCalledWith(reservations);
        expect(mockEventsPublisher.emitStockReleased).toHaveBeenCalledTimes(2);
      });

      // Verifies no error is thrown when no reservation exists
      it('should not throw if no reservations found', async () => {
        reservationRepository.find.mockResolvedValue([]);

        await expect(service.releaseReservation('cart-uuid-001')).resolves.not.toThrow();
      });

      // Verifies the release reason is correct
      it('should emit with correct release reason', async () => {
        const reservations = [createMockReservation()];

        reservationRepository.find.mockResolvedValue(reservations);
        reservationRepository.remove.mockResolvedValue(reservations as unknown as StockReservation);

        await service.releaseReservation('cart-uuid-001', StockReleaseReason.CHECKOUT_FAILED);

        expect(mockEventsPublisher.emitStockReleased).toHaveBeenCalledWith(
          expect.objectContaining({
            reason: StockReleaseReason.CHECKOUT_FAILED,
          }),
        );
      });
    });

    // confirmReservation tests
    describe('confirmReservation()', () => {
      // Verifies confirmation and decrement of actual stock
      it('should confirm and decrement actual stock', async () => {
        const product = createMockProduct({ stockQuantity: 100 });
        const reservation = createMockReservation({ quantity: 10, product });

        reservationRepository.find.mockResolvedValue([reservation]);
        productRepository.save.mockResolvedValue({ ...product, stockQuantity: 90 });
        reservationRepository.remove.mockResolvedValue([
          reservation,
        ] as unknown as StockReservation);

        await service.confirmReservation('cart-uuid-001');

        expect(productRepository.save).toHaveBeenCalledWith(
          expect.objectContaining({ stockQuantity: 90 }),
        );
        expect(mockEventsPublisher.emitStockConfirmed).toHaveBeenCalled();
      });

      // Verifies reservations are removed after confirmation
      it('should delete reservations after confirmation', async () => {
        const product = createMockProduct({ stockQuantity: 100 });
        const reservations = [createMockReservation({ quantity: 5, product })];

        reservationRepository.find.mockResolvedValue(reservations);
        productRepository.save.mockResolvedValue({ ...product, stockQuantity: 95 });
        reservationRepository.remove.mockResolvedValue(reservations as unknown as StockReservation);

        await service.confirmReservation('cart-uuid-001');

        expect(reservationRepository.remove).toHaveBeenCalledWith(reservations);
      });

      // Verifies an error is thrown when no reservation exists
      it('should throw error if no reservations found', async () => {
        reservationRepository.find.mockResolvedValue([]);

        await expect(service.confirmReservation('cart-uuid-001')).rejects.toMatchObject({
          error: expect.objectContaining({
            statusCode: 404,
            code: 'RESERVATIONS_NOT_FOUND',
          }),
        });
      });

      // Verifies a stock_low event is emitted when stock drops below threshold
      it('should emit stock_low if stock falls below threshold', async () => {
        const product = createMockProduct({ stockQuantity: 15, stockAlertThreshold: 10 });
        const reservation = createMockReservation({ quantity: 10, product });

        reservationRepository.find.mockResolvedValue([reservation]);
        productRepository.save.mockResolvedValue({ ...product, stockQuantity: 5 });
        reservationRepository.remove.mockResolvedValue([
          reservation,
        ] as unknown as StockReservation);

        await service.confirmReservation('cart-uuid-001');

        expect(mockEventsPublisher.emitStockLow).toHaveBeenCalledWith(
          expect.objectContaining({
            currentStock: 5,
          }),
        );
      });
    });

    // cleanupExpiredReservations tests
    describe('cleanupExpiredReservations()', () => {
      // Verifies expired non-confirmed reservations are removed
      it('should delete expired reservations that are not confirmed', async () => {
        const expiredReservations = [
          createMockReservation({
            id: 'res-001',
            expiresAt: new Date(Date.now() - 1000),
            confirmedAt: undefined,
            releasedAt: undefined,
          }),
        ];

        reservationRepository.find.mockResolvedValue(expiredReservations);
        reservationRepository.remove.mockResolvedValue(
          expiredReservations as unknown as StockReservation,
        );

        const result = await service.cleanupExpiredReservations();

        expect(result).toBe(1);
        expect(reservationRepository.remove).toHaveBeenCalledWith(expiredReservations);
        expect(mockEventsPublisher.emitStockReleased).toHaveBeenCalledWith(
          expect.objectContaining({
            reason: StockReleaseReason.EXPIRED,
          }),
        );
      });

      // Verifies confirmed reservations are not removed
      it('should NOT delete confirmed reservations', async () => {
        reservationRepository.find.mockResolvedValue([]);

        const result = await service.cleanupExpiredReservations();

        expect(result).toBe(0);
        expect(reservationRepository.remove).not.toHaveBeenCalled();
      });

      // Verifies 0 is returned when no expired reservation exists
      it('should return 0 if no expired reservations', async () => {
        reservationRepository.find.mockResolvedValue([]);

        const result = await service.cleanupExpiredReservations();

        expect(result).toBe(0);
      });
    });

    // getReservationsByCart tests
    describe('getReservationsByCart()', () => {
      // Verifies active reservations for a cart are returned
      it('should return active reservations for a cart', async () => {
        const reservations = [createMockReservation()];

        reservationRepository.find.mockResolvedValue(reservations);

        const result = await service.getReservationsByCart('cart-uuid-001');

        expect(reservationRepository.find).toHaveBeenCalledWith({
          where: {
            cartId: 'cart-uuid-001',
            confirmedAt: IsNull(),
            releasedAt: IsNull(),
          },
          order: { createdAt: 'ASC' },
        });
        expect(result).toHaveLength(1);
      });
    });

    // getReservationsByProduct tests
    describe('getReservationsByProduct()', () => {
      // Verifies active reservations for a product are returned
      it('should return active reservations for a product', async () => {
        const reservations = [
          createMockReservation({ cartId: 'cart-001' }),
          createMockReservation({ id: 'res-002', cartId: 'cart-002' }),
        ];

        reservationRepository.find.mockResolvedValue(reservations);

        const result = await service.getReservationsByProduct('prod-uuid-001');

        expect(reservationRepository.find).toHaveBeenCalledWith({
          where: {
            productId: 'prod-uuid-001',
            confirmedAt: IsNull(),
            releasedAt: IsNull(),
          },
          order: { createdAt: 'ASC' },
        });
        expect(result).toHaveLength(2);
      });
    });
  });

  // ==================== PRODUCT NOT FOUND ====================
  describe('Product Not Found', () => {
    // Verifies a 404 error is thrown for updateStock
    it('should throw 404 for updateStock if product not found', async () => {
      productRepository.findOne.mockResolvedValue(null);

      await expect(service.updateStock('non-existent', 100)).rejects.toMatchObject({
        error: expect.objectContaining({
          statusCode: 404,
          code: 'PRODUCT_NOT_FOUND',
        }),
      });
    });

    // Verifies a 404 error is thrown for getStockInfo
    it('should throw 404 for getStockInfo if product not found', async () => {
      productRepository.findOne.mockResolvedValue(null);

      await expect(service.getStockInfo('non-existent')).rejects.toMatchObject({
        error: expect.objectContaining({
          statusCode: 404,
          code: 'PRODUCT_NOT_FOUND',
        }),
      });
    });

    // Verifies a 404 error is thrown for checkAvailability
    it('should throw 404 for checkAvailability if product not found', async () => {
      productRepository.findOne.mockResolvedValue(null);

      await expect(service.checkAvailability('non-existent', 10)).rejects.toMatchObject({
        error: expect.objectContaining({
          statusCode: 404,
          code: 'PRODUCT_NOT_FOUND',
        }),
      });
    });

    // Verifies a 404 error is thrown for reserveStock
    it('should throw 404 for reserveStock if product not found', async () => {
      productRepository.findOne.mockResolvedValue(null);

      await expect(service.reserveStock('non-existent', 'cart-001', 5)).rejects.toMatchObject({
        error: expect.objectContaining({
          statusCode: 404,
          code: 'PRODUCT_NOT_FOUND',
        }),
      });
    });
  });
});
