import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RpcException } from '@nestjs/microservices';
import { Repository } from 'typeorm';
import { of } from 'rxjs';
import { OrderService } from './order.service';
import { CartService } from './cart.service';
import { Order } from '../entities/order.entity';
import { OrderItem } from '../entities/order-item.entity';
import {
  SERVICE_NAMES,
  EVENT_PATTERNS,
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
        where: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(0),
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderService,
        { provide: getRepositoryToken(Order), useValue: orderRepository },
        { provide: getRepositoryToken(OrderItem), useValue: orderItemRepository },
        { provide: CartService, useValue: cartService },
        { provide: SERVICE_NAMES.CATALOG, useValue: catalogClient },
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

    it('should increment sequence based on existing orders', async () => {
      (orderRepository.createQueryBuilder as jest.Mock).mockReturnValue({
        where: jest.fn().mockReturnThis(),
        getCount: jest.fn().mockResolvedValue(42),
      });

      const orderNumber = await service.generateOrderNumber();

      const year = new Date().getFullYear();
      expect(orderNumber).toBe(`CYN-${year}-00043`);
    });
  });

  describe('createOrderFromCart', () => {
    beforeEach(() => {
      catalogClient.send
        .mockReturnValueOnce(of(mockProducts[0]))
        .mockReturnValueOnce(of(mockProducts[1]));
      (orderRepository.findOne as jest.Mock).mockResolvedValue({
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
      (orderRepository.findOne as jest.Mock).mockResolvedValue({
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

    it('should clear cart after order creation', async () => {
      await service.createOrderFromCart({
        userId: 'user-1',
        cartId: 'cart-1',
        billingAddress: { street: '1 Rue', city: 'Paris' },
        email: 'user@test.com',
        stripePaymentIntentId: 'pi_123',
      });

      expect(cartService.clearCart).toHaveBeenCalledWith({
        userId: 'user-1',
        sessionId: undefined,
      });
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
      (orderRepository.findOne as jest.Mock).mockResolvedValue({
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
      (orderRepository.findOne as jest.Mock).mockResolvedValue({
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
    it('should return orders for user with items relation', async () => {
      (orderRepository.find as jest.Mock).mockResolvedValueOnce([mockOrder]);

      const result = await service.getOrdersByUserId('user-123');

      expect(result).toEqual([mockOrder]);
      expect(orderRepository.find).toHaveBeenCalledWith({
        where: { userId: 'user-123' },
        relations: ['items'],
        order: { createdAt: 'DESC' },
      });
    });
  });

  describe('getOrderById', () => {
    it('should return order when found', async () => {
      (orderRepository.findOne as jest.Mock).mockResolvedValueOnce(mockOrder);

      const result = await service.getOrderById('order-123');

      expect(result).toEqual(mockOrder);
    });

    it('should filter by userId when provided', async () => {
      (orderRepository.findOne as jest.Mock).mockResolvedValueOnce(mockOrder);

      await service.getOrderById('order-123', 'user-123');

      expect(orderRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'order-123', userId: 'user-123' },
        relations: ['items'],
      });
    });

    it('should throw RpcException when order not found', async () => {
      (orderRepository.findOne as jest.Mock).mockResolvedValueOnce(null);

      await expect(service.getOrderById('order-nonexistent')).rejects.toThrow(RpcException);
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
});
