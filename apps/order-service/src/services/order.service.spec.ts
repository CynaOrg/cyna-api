import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RpcException } from '@nestjs/microservices';
import { FindOperator, Repository } from 'typeorm';
import { of } from 'rxjs';
import { OrderService } from './order.service';
import { CartService } from './cart.service';
import { Order } from '../entities/order.entity';
import { OrderItem } from '../entities/order-item.entity';
import {
  SERVICE_NAMES,
  EVENT_PATTERNS,
  Language,
  OrderStatus,
  OrderType,
  ProductType,
} from '@cyna-api/common';

describe('OrderService', () => {
  let service: OrderService;
  let orderRepository: Partial<Repository<Order>>;
  let orderItemRepository: Partial<Repository<OrderItem>>;
  let cartService: Partial<CartService>;
  let catalogClient: { send: jest.Mock; emit: jest.Mock };

  const mockOrder: Partial<Order> = {
    id: 'order-123',
    orderNumber: 'CYN-2026-00001',
    userId: 'user-123',
    customerEmail: 'user@test.com',
    status: OrderStatus.PENDING,
    orderType: OrderType.LICENSE,
    subtotal: 49.99,
    taxAmount: 10.0,
    shippingAmount: 0,
    discountAmount: 0,
    total: 59.99,
    currency: 'EUR',
    billingAddressSnapshot: { street: '1 Rue', city: 'Paris' },
    shippingAddressSnapshot: null,
    stripePaymentIntentId: 'pi_test_123',
    paidAt: null,
    items: [
      {
        id: 'item-1',
        orderId: 'order-123',
        productId: 'prod-1',
        productSnapshot: { name: 'Test Product' },
        quantity: 1,
        unitPrice: 49.99,
        totalPrice: 49.99,
      } as unknown as OrderItem,
    ],
  };

  const mockCart = {
    id: 'cart-1',
    items: [
      { productId: 'prod-1', quantity: 2, billingPeriod: 'one_time' },
      { productId: 'prod-2', quantity: 1, billingPeriod: 'one_time' },
    ],
  };

  const mockProducts = [
    {
      id: 'prod-1',
      price: '49.99',
      priceUnit: '49.99',
      productType: ProductType.LICENSE,
      nameFr: 'Produit 1',
      nameEn: 'Product 1',
      slug: 'product-1',
      images: [{ url: 'http://img.com/1.png' }],
    },
    {
      id: 'prod-2',
      price: '29.99',
      priceUnit: '29.99',
      productType: ProductType.PHYSICAL,
      nameFr: 'Produit 2',
      nameEn: 'Product 2',
      slug: 'product-2',
      images: [],
    },
  ];

  beforeEach(async () => {
    orderRepository = {
      create: jest.fn().mockImplementation((entity) => ({ id: 'order-new', ...entity })),
      save: jest
        .fn()
        .mockImplementation((entity) => Promise.resolve({ id: 'order-new', ...entity })),
      findOne: jest.fn().mockResolvedValue(null),
      find: jest.fn().mockResolvedValue([]),
      createQueryBuilder: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ max_seq: 0 }),
      }),
    };

    orderItemRepository = {
      create: jest.fn().mockImplementation((entity) => ({ id: 'item-new', ...entity })),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
    };

    cartService = {
      findCartById: jest
        .fn()
        .mockResolvedValue({ id: 'cart-1', userId: 'user-1', sessionId: null }),
      getCart: jest.fn().mockResolvedValue(mockCart),
      clearCart: jest.fn().mockResolvedValue(undefined),
    };

    catalogClient = {
      send: jest.fn(),
      emit: jest.fn(),
    };

    const notificationClient = { emit: jest.fn() };
    const userClient = { send: jest.fn(), emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderService,
        { provide: getRepositoryToken(Order), useValue: orderRepository },
        { provide: getRepositoryToken(OrderItem), useValue: orderItemRepository },
        { provide: CartService, useValue: cartService },
        { provide: SERVICE_NAMES.CATALOG, useValue: catalogClient },
        { provide: SERVICE_NAMES.NOTIFICATION, useValue: notificationClient },
        { provide: SERVICE_NAMES.USER, useValue: userClient },
      ],
    }).compile();

    service = module.get<OrderService>(OrderService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('generateOrderNumber', () => {
    it('should generate order number with correct format', async () => {
      const orderNumber = await service.generateOrderNumber();

      const year = new Date().getFullYear();
      expect(orderNumber).toBe(`CYN-${year}-00001`);
    });

    it('should increment sequence based on max existing order number', async () => {
      (orderRepository.createQueryBuilder as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ max_seq: 42 }),
      });

      const orderNumber = await service.generateOrderNumber();

      const year = new Date().getFullYear();
      expect(orderNumber).toBe(`CYN-${year}-00043`);
    });

    it('should not reuse deleted sequence numbers (gap in MAX)', async () => {
      // Simulates orders 1..10 deleted but orders 11..24 kept; next must be 25.
      (orderRepository.createQueryBuilder as jest.Mock).mockReturnValue({
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ max_seq: '24' }),
      });

      const orderNumber = await service.generateOrderNumber();

      const year = new Date().getFullYear();
      expect(orderNumber).toBe(`CYN-${year}-00025`);
    });
  });

  describe('createOrderFromCart', () => {
    beforeEach(() => {
      catalogClient.send
        .mockReturnValueOnce(of(mockProducts[0]))
        .mockReturnValueOnce(of(mockProducts[1]));
      // First findOne call is the idempotency check (no existing pending
      // order for this cart); subsequent calls return the reloaded order.
      (orderRepository.findOne as jest.Mock).mockResolvedValueOnce(null).mockResolvedValue({
        id: 'order-new',
        items: [],
        orderNumber: 'CYN-2026-00001',
      });
    });

    it('should create order with server-side calculated prices', async () => {
      const result = await service.createOrderFromCart({
        userId: 'user-1',
        cartId: 'cart-1',
        billingAddress: { street: '1 Rue', city: 'Paris' },
        email: 'user@test.com',
        stripePaymentIntentId: 'pi_123',
      });

      expect(result).toBeDefined();
      expect(orderRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: OrderStatus.PENDING,
          currency: 'EUR',
          stripePaymentIntentId: 'pi_123',
        }),
      );
    });

    it('should calculate subtotal from product prices, not cart amounts', async () => {
      await service.createOrderFromCart({
        userId: 'user-1',
        cartId: 'cart-1',
        billingAddress: { street: '1 Rue', city: 'Paris' },
        email: 'user@test.com',
        stripePaymentIntentId: 'pi_123',
      });

      // subtotal = 49.99*2 + 29.99*1 = 129.97
      expect(orderRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          subtotal: 129.97,
        }),
      );
    });

    it('should apply 20% VAT tax', async () => {
      await service.createOrderFromCart({
        userId: 'user-1',
        cartId: 'cart-1',
        billingAddress: { street: '1 Rue', city: 'Paris' },
        email: 'user@test.com',
        stripePaymentIntentId: 'pi_123',
      });

      // taxAmount = round(129.97 * 0.2 * 100) / 100 = 25.99
      expect(orderRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          taxAmount: 25.99,
        }),
      );
    });

    it('should determine MIXED order type when multiple product types', async () => {
      await service.createOrderFromCart({
        userId: 'user-1',
        cartId: 'cart-1',
        billingAddress: { street: '1 Rue', city: 'Paris' },
        email: 'user@test.com',
        stripePaymentIntentId: 'pi_123',
      });

      // prod-1 is license, prod-2 is physical -> MIXED
      expect(orderRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          orderType: OrderType.MIXED,
        }),
      );
    });

    it('should determine single order type when all products are same type', async () => {
      const singleTypeCart = {
        id: 'cart-1',
        items: [{ productId: 'prod-1', quantity: 1, billingPeriod: 'one_time' }],
      };
      (cartService.getCart as jest.Mock).mockResolvedValueOnce(singleTypeCart);
      catalogClient.send.mockReset();
      catalogClient.send.mockReturnValueOnce(of(mockProducts[0]));
      // First findOne call is the idempotency check (no existing pending
      // order for this cart); subsequent calls return the reloaded order.
      (orderRepository.findOne as jest.Mock).mockResolvedValueOnce(null).mockResolvedValue({
        id: 'order-new',
        items: [],
        orderNumber: 'CYN-2026-00001',
      });

      await service.createOrderFromCart({
        userId: 'user-1',
        cartId: 'cart-1',
        billingAddress: { street: '1 Rue', city: 'Paris' },
        email: 'user@test.com',
        stripePaymentIntentId: 'pi_123',
      });

      expect(orderRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          orderType: OrderType.LICENSE,
        }),
      );
    });

    it('should NOT clear cart at order creation (cart is preserved until payment is confirmed)', async () => {
      await service.createOrderFromCart({
        userId: 'user-1',
        cartId: 'cart-1',
        billingAddress: { street: '1 Rue', city: 'Paris' },
        email: 'user@test.com',
        stripePaymentIntentId: 'pi_123',
      });

      expect(cartService.clearCart).not.toHaveBeenCalled();
    });

    it('should throw when cart is empty', async () => {
      (cartService.getCart as jest.Mock).mockResolvedValueOnce({ id: 'cart-1', items: [] });

      await expect(
        service.createOrderFromCart({
          userId: 'user-1',
          cartId: 'cart-1',
          billingAddress: { street: '1 Rue', city: 'Paris' },
          email: 'user@test.com',
          stripePaymentIntentId: 'pi_123',
        }),
      ).rejects.toThrow(RpcException);
    });

    it('should throw when cart is null', async () => {
      (cartService.getCart as jest.Mock).mockResolvedValueOnce(null);

      await expect(
        service.createOrderFromCart({
          userId: 'user-1',
          cartId: 'cart-1',
          billingAddress: { street: '1 Rue', city: 'Paris' },
          email: 'user@test.com',
          stripePaymentIntentId: 'pi_123',
        }),
      ).rejects.toThrow(RpcException);
    });

    it('should set customerEmail for guest orders (no userId)', async () => {
      catalogClient.send.mockReset();
      catalogClient.send
        .mockReturnValueOnce(of(mockProducts[0]))
        .mockReturnValueOnce(of(mockProducts[1]));
      // First findOne call is the idempotency check (no existing pending
      // order for this cart); subsequent calls return the reloaded order.
      (orderRepository.findOne as jest.Mock).mockResolvedValueOnce(null).mockResolvedValue({
        id: 'order-new',
        items: [],
        orderNumber: 'CYN-2026-00001',
      });

      await service.createOrderFromCart({
        cartId: 'cart-1',
        billingAddress: { street: '1 Rue', city: 'Paris' },
        email: 'guest@test.com',
        stripePaymentIntentId: 'pi_123',
      });

      expect(orderRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: null,
          customerEmail: 'guest@test.com',
        }),
      );
    });

    it('should set customerEmail for logged-in user orders', async () => {
      catalogClient.send.mockReset();
      catalogClient.send
        .mockReturnValueOnce(of(mockProducts[0]))
        .mockReturnValueOnce(of(mockProducts[1]));
      // First findOne call is the idempotency check (no existing pending
      // order for this cart); subsequent calls return the reloaded order.
      (orderRepository.findOne as jest.Mock).mockResolvedValueOnce(null).mockResolvedValue({
        id: 'order-new',
        items: [],
        orderNumber: 'CYN-2026-00001',
      });

      await service.createOrderFromCart({
        userId: 'user-1',
        cartId: 'cart-1',
        billingAddress: { street: '1 Rue', city: 'Paris' },
        email: 'user@test.com',
        stripePaymentIntentId: 'pi_123',
      });

      expect(orderRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          customerEmail: 'user@test.com',
        }),
      );
    });

    it('should create order items with product snapshots', async () => {
      await service.createOrderFromCart({
        userId: 'user-1',
        cartId: 'cart-1',
        billingAddress: { street: '1 Rue', city: 'Paris' },
        email: 'user@test.com',
        stripePaymentIntentId: 'pi_123',
      });

      // 2 cart items -> at least 2 order item creates
      expect(orderItemRepository.create).toHaveBeenCalledTimes(2);
      expect(orderItemRepository.save).toHaveBeenCalledTimes(2);
    });
  });

  describe('handlePaymentConfirmed', () => {
    it('should set order status to PAID and set paidAt', async () => {
      (orderRepository.findOne as jest.Mock).mockResolvedValueOnce({
        ...mockOrder,
        items: [{ productId: 'prod-1', quantity: 1 }],
      });

      await service.handlePaymentConfirmed('pi_test_123');

      expect(orderRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: OrderStatus.PAID,
          paidAt: expect.any(Date),
        }),
      );
    });

    it('should emit STOCK_CONFIRMED for each order item', async () => {
      (orderRepository.findOne as jest.Mock).mockResolvedValueOnce({
        ...mockOrder,
        items: [
          { productId: 'prod-1', quantity: 2 },
          { productId: 'prod-2', quantity: 1 },
        ],
      });

      await service.handlePaymentConfirmed('pi_test_123');

      expect(catalogClient.emit).toHaveBeenCalledTimes(2);
      expect(catalogClient.emit).toHaveBeenCalledWith(EVENT_PATTERNS.CATALOG.STOCK_CONFIRMED, {
        productId: 'prod-1',
        quantity: 2,
      });
      expect(catalogClient.emit).toHaveBeenCalledWith(EVENT_PATTERNS.CATALOG.STOCK_CONFIRMED, {
        productId: 'prod-2',
        quantity: 1,
      });
    });

    it('should not throw when order not found', async () => {
      (orderRepository.findOne as jest.Mock).mockResolvedValueOnce(null);

      await expect(service.handlePaymentConfirmed('pi_nonexistent')).resolves.toBeUndefined();
    });

    it('persists stripeInvoiceId and stripeInvoiceUrl when provided', async () => {
      (orderRepository.findOne as jest.Mock).mockResolvedValueOnce({
        ...mockOrder,
        items: [{ productId: 'prod-1', quantity: 1 }],
      });

      await service.handlePaymentConfirmed('pi_test_123', {
        stripeInvoiceId: 'ch_abc',
        stripeInvoiceUrl: 'https://stripe.test/receipt/ch_abc',
      });

      expect(orderRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: OrderStatus.PAID,
          stripeInvoiceId: 'ch_abc',
          stripeInvoiceUrl: 'https://stripe.test/receipt/ch_abc',
        }),
      );
    });
  });

  describe('handlePaymentFailed', () => {
    it('should set order status to CANCELLED', async () => {
      (orderRepository.findOne as jest.Mock).mockResolvedValueOnce({
        ...mockOrder,
        items: [{ productId: 'prod-1', quantity: 1 }],
      });

      await service.handlePaymentFailed('pi_test_123');

      expect(orderRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: OrderStatus.CANCELLED,
        }),
      );
    });

    it('should emit STOCK_RELEASED for each order item', async () => {
      (orderRepository.findOne as jest.Mock).mockResolvedValueOnce({
        ...mockOrder,
        items: [{ productId: 'prod-1', quantity: 3 }],
      });

      await service.handlePaymentFailed('pi_test_123');

      expect(catalogClient.emit).toHaveBeenCalledWith(EVENT_PATTERNS.CATALOG.STOCK_RELEASED, {
        productId: 'prod-1',
        quantity: 3,
      });
    });
  });

  describe('handlePaymentRefunded', () => {
    it('should set order status to REFUNDED', async () => {
      (orderRepository.findOne as jest.Mock).mockResolvedValueOnce({ ...mockOrder });

      await service.handlePaymentRefunded('pi_test_123');

      expect(orderRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: OrderStatus.REFUNDED,
        }),
      );
    });
  });

  describe('getOrdersByUserId', () => {
    it('should return non-pending orders for user with items relation', async () => {
      (orderRepository.find as jest.Mock).mockResolvedValueOnce([mockOrder]);

      const result = await service.getOrdersByUserId('user-123');

      expect(result).toEqual([mockOrder]);
      const findArgs = (orderRepository.find as jest.Mock).mock.calls[0][0];
      expect(findArgs.where.userId).toBe('user-123');
      // Status filter must be a `Not(PENDING)` operator so abandoned
      // checkouts don't leak into the user's order list.
      expect(findArgs.where.status).toBeInstanceOf(FindOperator);
      expect((findArgs.where.status as FindOperator<unknown>).type).toBe('not');
      expect((findArgs.where.status as FindOperator<unknown>).value).toBe(OrderStatus.PENDING);
      expect(findArgs.relations).toEqual(['items']);
      expect(findArgs.order).toEqual({ createdAt: 'DESC' });
    });
  });

  describe('getOrderById', () => {
    it('should return order when found (admin path: no userId)', async () => {
      (orderRepository.findOne as jest.Mock).mockResolvedValueOnce(mockOrder);

      const result = await service.getOrderById('order-123');

      expect(result).toEqual(mockOrder);
      // Admin path doesn't constrain by status — admins still see PENDING.
      const findArgs = (orderRepository.findOne as jest.Mock).mock.calls[0][0];
      expect(findArgs.where).toEqual({ id: 'order-123' });
    });

    it('should filter by userId and exclude PENDING when userId provided', async () => {
      (orderRepository.findOne as jest.Mock).mockResolvedValueOnce({
        ...mockOrder,
        status: OrderStatus.PAID,
      });

      await service.getOrderById('order-123', 'user-123');

      const findArgs = (orderRepository.findOne as jest.Mock).mock.calls[0][0];
      expect(findArgs.where.id).toBe('order-123');
      expect(findArgs.where.userId).toBe('user-123');
      expect(findArgs.where.status).toBeInstanceOf(FindOperator);
      expect((findArgs.where.status as FindOperator<unknown>).type).toBe('not');
      expect((findArgs.where.status as FindOperator<unknown>).value).toBe(OrderStatus.PENDING);
      expect(findArgs.relations).toEqual(['items']);
    });

    it('should throw RpcException when order not found', async () => {
      (orderRepository.findOne as jest.Mock).mockResolvedValueOnce(null);

      await expect(service.getOrderById('order-nonexistent')).rejects.toThrow(RpcException);
    });

    it('should throw RpcException when the only matching order is PENDING (filtered out)', async () => {
      // Simulates a user trying to access their abandoned checkout's order
      // detail page: the row exists but the user-facing query filters it out.
      (orderRepository.findOne as jest.Mock).mockResolvedValueOnce(null);

      await expect(service.getOrderById('pending-order-id', 'user-123')).rejects.toThrow(
        RpcException,
      );
    });
  });

  describe('getOrderByPaymentIntentId', () => {
    it('should find order by stripePaymentIntentId', async () => {
      (orderRepository.findOne as jest.Mock).mockResolvedValueOnce(mockOrder);

      const result = await service.getOrderByPaymentIntentId('pi_test_123');

      expect(result).toEqual(mockOrder);
      expect(orderRepository.findOne).toHaveBeenCalledWith({
        where: { stripePaymentIntentId: 'pi_test_123' },
        relations: ['items'],
      });
    });

    it('should return null when not found', async () => {
      const result = await service.getOrderByPaymentIntentId('pi_nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('createOrderFromCart notification snapshot', () => {
    beforeEach(() => {
      catalogClient.send
        .mockReturnValueOnce(of(mockProducts[0]))
        .mockReturnValueOnce(of(mockProducts[1]));
      // First findOne call is the idempotency check (no existing pending
      // order for this cart); subsequent calls return the reloaded order.
      (orderRepository.findOne as jest.Mock).mockResolvedValueOnce(null).mockResolvedValue({
        id: 'order-new',
        items: [],
        orderNumber: 'CYN-2026-00001',
      });
    });

    it('persists notificationEmail and notificationLanguage from the input data', async () => {
      await service.createOrderFromCart({
        userId: 'user-1',
        cartId: 'cart-1',
        billingAddress: { street: '1 Rue', city: 'Paris' },
        email: 'user@test.com',
        preferredLanguage: Language.EN,
        stripePaymentIntentId: 'pi_123',
      });

      expect(orderRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          notificationEmail: 'user@test.com',
          notificationLanguage: Language.EN,
        }),
      );
    });

    it("defaults notificationLanguage to 'fr' when preferredLanguage is undefined", async () => {
      await service.createOrderFromCart({
        userId: 'user-1',
        cartId: 'cart-1',
        billingAddress: { street: '1 Rue', city: 'Paris' },
        email: 'user@test.com',
        stripePaymentIntentId: 'pi_123',
      });

      expect(orderRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          notificationEmail: 'user@test.com',
          notificationLanguage: Language.FR,
        }),
      );
    });
  });

  describe('createOrderFromCart idempotency', () => {
    it('returns reused pending order when one exists for the same cart', async () => {
      const existingPending = {
        id: 'order-existing',
        orderNumber: 'CYN-2026-99999',
        cartId: 'cart-1',
        status: OrderStatus.PENDING,
        customerEmail: 'old@test.com',
        notificationEmail: 'old@test.com',
        billingAddressSnapshot: { street: 'old' },
        shippingAddressSnapshot: null,
        items: [],
      };
      (orderRepository.findOne as jest.Mock)
        .mockResolvedValueOnce(existingPending)
        .mockResolvedValueOnce({ ...existingPending, items: [] });

      const result = await service.createOrderFromCart({
        userId: 'user-1',
        cartId: 'cart-1',
        billingAddress: { street: 'new' },
        shippingAddress: { city: 'Lyon' },
        email: 'new@test.com',
        stripePaymentIntentId: 'pi_new',
      });

      // Address & email snapshots should be refreshed; save called once.
      expect(orderRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          customerEmail: 'new@test.com',
          notificationEmail: 'new@test.com',
          billingAddressSnapshot: { street: 'new' },
          shippingAddressSnapshot: { city: 'Lyon' },
        }),
      );
      // Cart was not re-fetched (no second `findCartById` from cartService).
      expect(cartService.findCartById).not.toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('returns reused pending order without saving when nothing changed', async () => {
      const existingPending = {
        id: 'order-existing',
        orderNumber: 'CYN-2026-99999',
        cartId: 'cart-1',
        status: OrderStatus.PENDING,
        customerEmail: 'same@test.com',
        notificationEmail: 'same@test.com',
        billingAddressSnapshot: null,
        shippingAddressSnapshot: undefined,
        items: [],
      };
      (orderRepository.findOne as jest.Mock)
        .mockResolvedValueOnce(existingPending)
        .mockResolvedValueOnce(existingPending);

      await service.createOrderFromCart({
        userId: 'user-1',
        cartId: 'cart-1',
        // billingAddress falsy + shippingAddress undefined + same email
        // means no mutation flag — save must not be called.
        billingAddress: null as unknown as Record<string, unknown>,
        email: 'same@test.com',
        stripePaymentIntentId: 'pi_x',
      });

      expect(orderRepository.save).not.toHaveBeenCalled();
    });
  });

  describe('createOrderFromCart error paths', () => {
    it('throws CART_NOT_FOUND when cartService.findCartById returns null', async () => {
      (orderRepository.findOne as jest.Mock).mockResolvedValueOnce(null);
      (cartService.findCartById as jest.Mock).mockResolvedValueOnce(null);

      await expect(
        service.createOrderFromCart({
          userId: 'u1',
          cartId: 'cart-missing',
          billingAddress: { street: '1' },
          email: 'u@test.com',
          stripePaymentIntentId: 'pi_1',
        }),
      ).rejects.toMatchObject({ error: expect.objectContaining({ code: 'CART_NOT_FOUND' }) });
    });

    it('throws PRODUCT_NOT_FOUND when a cart item references a missing product', async () => {
      // cart has prod-3 but catalog returns prod-1 only — productMap miss
      (cartService.getCart as jest.Mock).mockResolvedValueOnce({
        id: 'cart-1',
        items: [{ productId: 'prod-3', quantity: 1, billingPeriod: 'one_time' }],
      });
      catalogClient.send.mockReturnValueOnce(of({ ...mockProducts[0], id: 'prod-OTHER' }));
      (orderRepository.findOne as jest.Mock).mockResolvedValueOnce(null);

      await expect(
        service.createOrderFromCart({
          userId: 'u1',
          cartId: 'cart-1',
          billingAddress: { street: '1' },
          email: 'u@test.com',
          stripePaymentIntentId: 'pi_1',
        }),
      ).rejects.toMatchObject({
        error: expect.objectContaining({ code: 'PRODUCT_NOT_FOUND' }),
      });
    });

    it('uses priceMonthly for monthly billing periods', async () => {
      (cartService.getCart as jest.Mock).mockResolvedValueOnce({
        id: 'cart-1',
        items: [{ productId: 'prod-1', quantity: 1, billingPeriod: 'monthly' }],
      });
      catalogClient.send.mockReturnValueOnce(
        of({
          id: 'prod-1',
          priceMonthly: 9.99,
          priceYearly: 99,
          priceUnit: 49.99,
          productType: ProductType.SAAS,
        }),
      );
      (orderRepository.findOne as jest.Mock).mockResolvedValueOnce(null).mockResolvedValue({
        id: 'order-new',
        items: [],
        orderNumber: 'CYN-2026-00001',
      });

      await service.createOrderFromCart({
        userId: 'u1',
        cartId: 'cart-1',
        billingAddress: { street: '1' },
        email: 'u@test.com',
        stripePaymentIntentId: 'pi_1',
      });

      expect(orderRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ subtotal: 9.99 }),
      );
    });

    it('uses priceYearly for yearly billing periods', async () => {
      (cartService.getCart as jest.Mock).mockResolvedValueOnce({
        id: 'cart-1',
        items: [{ productId: 'prod-1', quantity: 1, billingPeriod: 'yearly' }],
      });
      catalogClient.send.mockReturnValueOnce(
        of({
          id: 'prod-1',
          priceMonthly: 9.99,
          priceYearly: 99,
          priceUnit: 49.99,
          productType: ProductType.SAAS,
        }),
      );
      (orderRepository.findOne as jest.Mock).mockResolvedValueOnce(null).mockResolvedValue({
        id: 'order-new',
        items: [],
      });

      await service.createOrderFromCart({
        userId: 'u1',
        cartId: 'cart-1',
        billingAddress: { street: '1' },
        email: 'u@test.com',
        stripePaymentIntentId: 'pi_1',
      });

      expect(orderRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ subtotal: 99 }),
      );
    });

    it('retries on unique-violation (23505) and succeeds on the next attempt', async () => {
      catalogClient.send
        .mockReturnValueOnce(of(mockProducts[0]))
        .mockReturnValueOnce(of(mockProducts[1]));
      (orderRepository.findOne as jest.Mock).mockResolvedValueOnce(null).mockResolvedValue({
        id: 'order-new',
        items: [],
      });

      // First save throws unique violation, second succeeds.
      (orderRepository.save as jest.Mock)
        .mockRejectedValueOnce(Object.assign(new Error('dup'), { code: '23505' }))
        .mockImplementationOnce((entity) => Promise.resolve({ id: 'order-new', ...entity }));

      await service.createOrderFromCart({
        userId: 'u1',
        cartId: 'cart-1',
        billingAddress: { street: '1' },
        email: 'u@test.com',
        stripePaymentIntentId: 'pi_1',
      });

      expect(orderRepository.create).toHaveBeenCalledTimes(2);
    });

    it('rethrows non-unique-violation errors from save without retrying', async () => {
      catalogClient.send
        .mockReturnValueOnce(of(mockProducts[0]))
        .mockReturnValueOnce(of(mockProducts[1]));
      (orderRepository.findOne as jest.Mock).mockResolvedValueOnce(null);

      const fatal = Object.assign(new Error('disk full'), { code: 'IO_ERR' });
      (orderRepository.save as jest.Mock).mockRejectedValueOnce(fatal);

      await expect(
        service.createOrderFromCart({
          userId: 'u1',
          cartId: 'cart-1',
          billingAddress: { street: '1' },
          email: 'u@test.com',
          stripePaymentIntentId: 'pi_1',
        }),
      ).rejects.toBe(fatal);
    });
  });

  describe('adminGetOrders', () => {
    let qb: Record<string, jest.Mock>;

    beforeEach(() => {
      qb = {
        leftJoinAndSelect: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(0),
        getMany: jest.fn().mockResolvedValue([]),
      };
      (orderRepository.createQueryBuilder as jest.Mock).mockReturnValue(qb);
    });

    it('returns the empty page shape with default pagination', async () => {
      const result = await service.adminGetOrders({});

      expect(result).toEqual({
        data: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
      });
      expect(qb.skip).toHaveBeenCalledWith(0);
      expect(qb.take).toHaveBeenCalledWith(20);
    });

    it('maps each order through the AdminOrderListItem projection', async () => {
      qb.getCount.mockResolvedValueOnce(1);
      qb.getMany.mockResolvedValueOnce([
        {
          id: 'o1',
          orderNumber: 'CYN-1',
          userId: 'u1',
          customerEmail: 'a@b.com',
          notificationEmail: 'a@b.com',
          status: OrderStatus.PAID,
          orderType: OrderType.LICENSE,
          subtotal: 10,
          taxAmount: 2,
          shippingAmount: 0,
          discountAmount: 0,
          total: 12,
          currency: 'EUR',
          stripePaymentIntentId: 'pi',
          stripeInvoiceUrl: 'url',
          paidAt: null,
          shippedAt: null,
          deliveredAt: null,
          trackingNumber: null,
          trackingUrl: null,
          notes: null,
          items: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const result = await service.adminGetOrders({ page: 1, limit: 10 });

      expect(result.totalPages).toBe(1);
      expect(result.data[0]).toEqual(
        expect.objectContaining({ id: 'o1', orderNumber: 'CYN-1', customerEmail: 'a@b.com' }),
      );
    });

    it('applies status, userId, orderType, search, and date filters when provided', async () => {
      await service.adminGetOrders({
        userId: 'u1',
        status: 'paid',
        search: 'CYN',
        dateFrom: '2026-01-01',
        dateTo: '2026-12-31',
        orderType: 'physical',
        page: 3,
        limit: 5,
      });

      const whereCalls = qb.andWhere.mock.calls.map((c) => c[0] as string);
      expect(whereCalls).toEqual(
        expect.arrayContaining([
          'order.userId = :userId',
          'order.status = :status',
          'order.orderType = :orderType',
          '(order.orderNumber ILIKE :search OR order.customerEmail ILIKE :search)',
          'order.createdAt >= :dateFrom',
          'order.createdAt <= :dateTo',
        ]),
      );
      expect(qb.skip).toHaveBeenCalledWith(10); // (page-1)*limit = 2*5
      expect(qb.take).toHaveBeenCalledWith(5);
    });

    it('normalises a date-only dateTo to end-of-day', async () => {
      await service.adminGetOrders({ dateTo: '2026-06-15' });

      const dateToCall = qb.andWhere.mock.calls.find((c) => c[0] === 'order.createdAt <= :dateTo');
      expect(dateToCall).toBeDefined();
      const dt = (dateToCall![1] as { dateTo: Date }).dateTo;
      expect(dt).toBeInstanceOf(Date);
      expect(dt.toISOString()).toBe('2026-06-15T23:59:59.999Z');
    });

    it('keeps full timestamp resolution when dateTo includes time', async () => {
      await service.adminGetOrders({ dateTo: '2026-06-15T10:00:00.000Z' });

      const dateToCall = qb.andWhere.mock.calls.find((c) => c[0] === 'order.createdAt <= :dateTo');
      const dt = (dateToCall![1] as { dateTo: Date }).dateTo;
      expect(dt.toISOString()).toBe('2026-06-15T10:00:00.000Z');
    });
  });

  describe('adminUpdateOrderStatus', () => {
    it('throws ORDER_NOT_FOUND when order does not exist', async () => {
      (orderRepository.findOne as jest.Mock).mockResolvedValueOnce(null);

      await expect(service.adminUpdateOrderStatus('missing', 'paid')).rejects.toMatchObject({
        error: expect.objectContaining({ code: 'ORDER_NOT_FOUND' }),
      });
    });

    it('sets paidAt when transitioning to PAID', async () => {
      (orderRepository.findOne as jest.Mock).mockResolvedValueOnce({
        ...mockOrder,
        status: OrderStatus.PENDING,
      });

      await service.adminUpdateOrderStatus('order-123', OrderStatus.PAID);

      expect(orderRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: OrderStatus.PAID, paidAt: expect.any(Date) }),
      );
    });

    it('sets shippedAt and emits ORDER.SHIPPED on PAID -> SHIPPED transition', async () => {
      const notificationEmit = jest.fn();
      // Re-wire the service with a controllable notification client
      (service as unknown as { notificationClient: { emit: jest.Mock } }).notificationClient = {
        emit: notificationEmit,
      };

      (orderRepository.findOne as jest.Mock).mockResolvedValueOnce({
        ...mockOrder,
        status: OrderStatus.PAID,
        notificationEmail: 'notify@test.com',
        notificationLanguage: Language.EN,
        trackingNumber: 'TRK1',
        trackingUrl: 'https://track/TRK1',
      });

      await service.adminUpdateOrderStatus(
        'order-123',
        OrderStatus.SHIPPED,
        'note',
        'TRK1',
        'https://track/TRK1',
      );

      expect(orderRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: OrderStatus.SHIPPED,
          shippedAt: expect.any(Date),
          notes: 'note',
          trackingNumber: 'TRK1',
          trackingUrl: 'https://track/TRK1',
        }),
      );
      expect(notificationEmit).toHaveBeenCalledWith(
        EVENT_PATTERNS.ORDER.SHIPPED,
        expect.objectContaining({
          orderId: 'order-123',
          email: 'notify@test.com',
          language: Language.EN,
          trackingNumber: 'TRK1',
          trackingUrl: 'https://track/TRK1',
        }),
      );
    });

    it('does NOT re-emit ORDER.SHIPPED when the order is already SHIPPED', async () => {
      const notificationEmit = jest.fn();
      (service as unknown as { notificationClient: { emit: jest.Mock } }).notificationClient = {
        emit: notificationEmit,
      };

      (orderRepository.findOne as jest.Mock).mockResolvedValueOnce({
        ...mockOrder,
        status: OrderStatus.SHIPPED,
        notificationEmail: 'notify@test.com',
      });

      await service.adminUpdateOrderStatus('order-123', OrderStatus.SHIPPED);

      expect(notificationEmit).not.toHaveBeenCalled();
    });

    it('sets deliveredAt on transition to DELIVERED', async () => {
      (orderRepository.findOne as jest.Mock).mockResolvedValueOnce({
        ...mockOrder,
        status: OrderStatus.SHIPPED,
      });

      await service.adminUpdateOrderStatus('order-123', OrderStatus.DELIVERED);

      expect(orderRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: OrderStatus.DELIVERED,
          deliveredAt: expect.any(Date),
        }),
      );
    });

    it('clears notes when explicitly passed as null', async () => {
      (orderRepository.findOne as jest.Mock).mockResolvedValueOnce({
        ...mockOrder,
        status: OrderStatus.PENDING,
        notes: 'old',
      });

      await service.adminUpdateOrderStatus('order-123', OrderStatus.PROCESSING, null);

      expect(orderRepository.save).toHaveBeenCalledWith(expect.objectContaining({ notes: null }));
    });
  });

  describe('updateStripePaymentIntentId', () => {
    it('persists the new payment intent id via repository.update', async () => {
      (orderRepository.update as jest.Mock) = jest.fn().mockResolvedValue({ affected: 1 });

      await service.updateStripePaymentIntentId('order-1', 'pi_new');

      expect(orderRepository.update).toHaveBeenCalledWith('order-1', {
        stripePaymentIntentId: 'pi_new',
      });
    });
  });
});
