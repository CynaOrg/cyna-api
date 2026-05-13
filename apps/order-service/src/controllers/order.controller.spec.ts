import { Test, TestingModule } from '@nestjs/testing';
import { RpcException } from '@nestjs/microservices';
import { OrderController } from './order.controller';
import { CartService, OrderService } from '../services';
import { BillingPeriod, Language } from '@cyna-api/common';

describe('OrderController', () => {
  let controller: OrderController;
  let cartService: Record<string, jest.Mock>;
  let orderService: Record<string, jest.Mock>;

  beforeEach(async () => {
    cartService = {
      getCart: jest.fn(),
      addItem: jest.fn(),
      updateItem: jest.fn(),
      removeItem: jest.fn(),
      clearCart: jest.fn(),
      mergeGuestCart: jest.fn(),
    };

    orderService = {
      createOrderFromCart: jest.fn(),
      getOrdersByUserId: jest.fn(),
      getOrderById: jest.fn(),
      getOrderByPaymentIntentId: jest.fn(),
      handlePaymentConfirmed: jest.fn(),
      handlePaymentFailed: jest.fn(),
      handlePaymentRefunded: jest.fn(),
      adminGetOrders: jest.fn(),
      adminUpdateOrderStatus: jest.fn(),
      updateStripePaymentIntentId: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrderController],
      providers: [
        { provide: CartService, useValue: cartService },
        { provide: OrderService, useValue: orderService },
      ],
    }).compile();

    controller = module.get<OrderController>(OrderController);
  });

  afterEach(() => jest.clearAllMocks());

  // ---------- Cart endpoints ----------

  describe('getCart', () => {
    it('forwards owner identity to the service', async () => {
      cartService.getCart.mockResolvedValueOnce({ id: 'c1' } as never);

      const result = await controller.getCart({ userId: 'u1', sessionId: 's1' });

      expect(cartService.getCart).toHaveBeenCalledWith({ userId: 'u1', sessionId: 's1' });
      expect(result).toEqual({ id: 'c1' });
    });

    it('passes through RpcException raised by the service unchanged', async () => {
      const rpc = new RpcException({ statusCode: 404, message: 'x', code: 'X' });
      cartService.getCart.mockRejectedValueOnce(rpc);

      await expect(controller.getCart({ userId: 'u1' })).rejects.toBe(rpc);
    });

    it('wraps an unknown Error in a 500 RpcException', async () => {
      cartService.getCart.mockRejectedValueOnce(new Error('boom'));

      await expect(controller.getCart({ userId: 'u1' })).rejects.toMatchObject({
        error: expect.objectContaining({
          statusCode: 500,
          code: 'ORDER_SERVICE_ERROR',
          message: 'boom',
        }),
      });
    });

    it('wraps a non-Error throwable in a 500 RpcException with a default message', async () => {
      cartService.getCart.mockRejectedValueOnce('string thrown');

      await expect(controller.getCart({})).rejects.toMatchObject({
        error: expect.objectContaining({
          statusCode: 500,
          message: 'Unknown order service error',
        }),
      });
    });
  });

  describe('addCartItem', () => {
    it('forwards dto and owner to cartService.addItem', async () => {
      cartService.addItem.mockResolvedValueOnce({ id: 'c1' } as never);

      await controller.addCartItem({
        userId: 'u1',
        dto: { productId: 'p1', quantity: 1, billingPeriod: BillingPeriod.ONE_TIME },
      });

      expect(cartService.addItem).toHaveBeenCalledWith(
        { userId: 'u1', sessionId: undefined },
        { productId: 'p1', quantity: 1, billingPeriod: BillingPeriod.ONE_TIME },
      );
    });

    it('wraps service errors', async () => {
      cartService.addItem.mockRejectedValueOnce(new Error('nope'));

      await expect(
        controller.addCartItem({
          sessionId: 's1',
          dto: { productId: 'p1', quantity: 1 } as never,
        }),
      ).rejects.toThrow(RpcException);
    });
  });

  describe('updateCartItem', () => {
    it('forwards billingPeriod to the service when provided', async () => {
      cartService.updateItem.mockResolvedValueOnce({} as never);

      await controller.updateCartItem({
        userId: 'u1',
        productId: 'p1',
        dto: { quantity: 4 },
        billingPeriod: 'monthly',
      });

      expect(cartService.updateItem).toHaveBeenCalledWith(
        { userId: 'u1', sessionId: undefined },
        'p1',
        { quantity: 4 },
        'monthly',
      );
    });

    it('passes undefined billingPeriod through', async () => {
      cartService.updateItem.mockResolvedValueOnce({} as never);

      await controller.updateCartItem({
        userId: 'u1',
        productId: 'p1',
        dto: { quantity: 1 },
      });

      expect(cartService.updateItem).toHaveBeenCalledWith(
        { userId: 'u1', sessionId: undefined },
        'p1',
        { quantity: 1 },
        undefined,
      );
    });
  });

  describe('removeCartItem', () => {
    it('forwards owner, productId, and billingPeriod', async () => {
      cartService.removeItem.mockResolvedValueOnce({} as never);

      await controller.removeCartItem({
        userId: 'u1',
        productId: 'p1',
        billingPeriod: 'yearly',
      });

      expect(cartService.removeItem).toHaveBeenCalledWith(
        { userId: 'u1', sessionId: undefined },
        'p1',
        'yearly',
      );
    });

    it('wraps service errors', async () => {
      cartService.removeItem.mockRejectedValueOnce(new Error('fail'));

      await expect(controller.removeCartItem({ userId: 'u1', productId: 'p1' })).rejects.toThrow(
        RpcException,
      );
    });
  });

  describe('clearCart', () => {
    it('delegates to cartService.clearCart', async () => {
      cartService.clearCart.mockResolvedValueOnce({ success: true });

      const result = await controller.clearCart({ sessionId: 's1' });

      expect(cartService.clearCart).toHaveBeenCalledWith({ userId: undefined, sessionId: 's1' });
      expect(result).toEqual({ success: true });
    });

    it('wraps service errors', async () => {
      cartService.clearCart.mockRejectedValueOnce(new Error('fail'));
      await expect(controller.clearCart({})).rejects.toThrow(RpcException);
    });
  });

  describe('mergeGuestCart', () => {
    it('forwards userId and sessionId', async () => {
      cartService.mergeGuestCart.mockResolvedValueOnce({ id: 'merged' } as never);

      const result = await controller.mergeGuestCart({ userId: 'u1', sessionId: 's1' });

      expect(cartService.mergeGuestCart).toHaveBeenCalledWith('u1', 's1');
      expect(result).toEqual({ id: 'merged' });
    });

    it('wraps service errors', async () => {
      cartService.mergeGuestCart.mockRejectedValueOnce(new Error('fail'));
      await expect(controller.mergeGuestCart({ userId: 'u1', sessionId: 's1' })).rejects.toThrow(
        RpcException,
      );
    });
  });

  // ---------- Order endpoints ----------

  describe('createOrder', () => {
    it('forwards the full payload', async () => {
      orderService.createOrderFromCart.mockResolvedValueOnce({ id: 'o1' } as never);
      const payload = {
        userId: 'u1',
        cartId: 'c1',
        billingAddress: { city: 'Paris' },
        email: 'u@test.com',
        preferredLanguage: Language.EN,
        stripePaymentIntentId: 'pi_1',
      };

      await controller.createOrder(payload);

      expect(orderService.createOrderFromCart).toHaveBeenCalledWith(payload);
    });

    it('wraps RpcException raised inside the service', async () => {
      const rpc = new RpcException({ statusCode: 400, message: 'empty', code: 'CART_EMPTY' });
      orderService.createOrderFromCart.mockRejectedValueOnce(rpc);

      await expect(
        controller.createOrder({
          cartId: 'c1',
          billingAddress: {},
          email: 'u@test.com',
          stripePaymentIntentId: 'pi_1',
        }),
      ).rejects.toBe(rpc);
    });
  });

  describe('getOrders', () => {
    it('delegates to getOrdersByUserId', async () => {
      orderService.getOrdersByUserId.mockResolvedValueOnce([]);

      const result = await controller.getOrders({ userId: 'u1' });

      expect(orderService.getOrdersByUserId).toHaveBeenCalledWith('u1');
      expect(result).toEqual([]);
    });
  });

  describe('getOrder', () => {
    it('passes userId for ownership scoping (anti-IDOR)', async () => {
      orderService.getOrderById.mockResolvedValueOnce({ id: 'o1' } as never);

      await controller.getOrder({ orderId: 'o1', userId: 'u1' });

      expect(orderService.getOrderById).toHaveBeenCalledWith('o1', 'u1');
    });

    it('passes undefined userId for the admin path', async () => {
      orderService.getOrderById.mockResolvedValueOnce({ id: 'o1' } as never);

      await controller.getOrder({ orderId: 'o1' });

      expect(orderService.getOrderById).toHaveBeenCalledWith('o1', undefined);
    });
  });

  describe('getOrderByPaymentIntent', () => {
    it('delegates to the service', async () => {
      orderService.getOrderByPaymentIntentId.mockResolvedValueOnce(null);

      const result = await controller.getOrderByPaymentIntent({ paymentIntentId: 'pi_1' });

      expect(orderService.getOrderByPaymentIntentId).toHaveBeenCalledWith('pi_1');
      expect(result).toBeNull();
    });
  });

  // ---------- Event handlers ----------

  describe('onPaymentConfirmed', () => {
    it('forwards invoice fields, defaulting to null', async () => {
      orderService.handlePaymentConfirmed.mockResolvedValueOnce(undefined);

      await controller.onPaymentConfirmed({
        paymentIntentId: 'pi_1',
        stripeInvoiceId: 'in_1',
        stripeInvoiceUrl: 'https://stripe/in_1',
      });

      expect(orderService.handlePaymentConfirmed).toHaveBeenCalledWith('pi_1', {
        stripeInvoiceId: 'in_1',
        stripeInvoiceUrl: 'https://stripe/in_1',
      });
    });

    it('defaults missing invoice fields to null', async () => {
      orderService.handlePaymentConfirmed.mockResolvedValueOnce(undefined);

      await controller.onPaymentConfirmed({ paymentIntentId: 'pi_1' });

      expect(orderService.handlePaymentConfirmed).toHaveBeenCalledWith('pi_1', {
        stripeInvoiceId: null,
        stripeInvoiceUrl: null,
      });
    });

    it('swallows service errors (event handler must not crash the worker)', async () => {
      orderService.handlePaymentConfirmed.mockRejectedValueOnce(new Error('boom'));

      await expect(
        controller.onPaymentConfirmed({ paymentIntentId: 'pi_1' }),
      ).resolves.toBeUndefined();
    });
  });

  describe('onPaymentFailed', () => {
    it('delegates to handlePaymentFailed', async () => {
      orderService.handlePaymentFailed.mockResolvedValueOnce(undefined);

      await controller.onPaymentFailed({ paymentIntentId: 'pi_1' });

      expect(orderService.handlePaymentFailed).toHaveBeenCalledWith('pi_1');
    });

    it('swallows service errors', async () => {
      orderService.handlePaymentFailed.mockRejectedValueOnce(new Error('boom'));

      await expect(
        controller.onPaymentFailed({ paymentIntentId: 'pi_1' }),
      ).resolves.toBeUndefined();
    });
  });

  describe('onPaymentRefunded', () => {
    it('delegates to handlePaymentRefunded', async () => {
      orderService.handlePaymentRefunded.mockResolvedValueOnce(undefined);

      await controller.onPaymentRefunded({ paymentIntentId: 'pi_1' });

      expect(orderService.handlePaymentRefunded).toHaveBeenCalledWith('pi_1');
    });

    it('swallows service errors', async () => {
      orderService.handlePaymentRefunded.mockRejectedValueOnce(new Error('boom'));

      await expect(
        controller.onPaymentRefunded({ paymentIntentId: 'pi_1' }),
      ).resolves.toBeUndefined();
    });
  });

  // ---------- Admin endpoints ----------

  describe('adminGetOrders', () => {
    it('forwards filter and pagination params', async () => {
      orderService.adminGetOrders.mockResolvedValueOnce({
        data: [],
        total: 0,
        page: 2,
        limit: 10,
        totalPages: 0,
      });

      const params = {
        search: 'CYN',
        status: 'paid',
        dateFrom: '2026-01-01',
        dateTo: '2026-12-31',
        orderType: 'physical',
        userId: 'u1',
        page: 2,
        limit: 10,
      };
      await controller.adminGetOrders(params);

      expect(orderService.adminGetOrders).toHaveBeenCalledWith(params);
    });

    it('wraps service errors', async () => {
      orderService.adminGetOrders.mockRejectedValueOnce(new Error('fail'));

      await expect(controller.adminGetOrders({})).rejects.toThrow(RpcException);
    });
  });

  describe('adminUpdateStatus', () => {
    it('forwards optional notes and tracking fields', async () => {
      orderService.adminUpdateOrderStatus.mockResolvedValueOnce({ id: 'o1' } as never);

      await controller.adminUpdateStatus({
        orderId: 'o1',
        status: 'shipped',
        notes: 'left on porch',
        trackingNumber: 'TRK1',
        trackingUrl: 'https://track/TRK1',
      });

      expect(orderService.adminUpdateOrderStatus).toHaveBeenCalledWith(
        'o1',
        'shipped',
        'left on porch',
        'TRK1',
        'https://track/TRK1',
      );
    });
  });

  describe('onUpdateOrderStatus', () => {
    it('forwards orderId + stripePaymentIntentId to updateStripePaymentIntentId', async () => {
      orderService.updateStripePaymentIntentId.mockResolvedValueOnce(undefined);

      await controller.onUpdateOrderStatus({ orderId: 'o1', stripePaymentIntentId: 'pi_2' });

      expect(orderService.updateStripePaymentIntentId).toHaveBeenCalledWith('o1', 'pi_2');
    });

    it('swallows service errors (event handler)', async () => {
      orderService.updateStripePaymentIntentId.mockRejectedValueOnce(new Error('boom'));

      await expect(
        controller.onUpdateOrderStatus({ orderId: 'o1', stripePaymentIntentId: 'pi_2' }),
      ).resolves.toBeUndefined();
    });
  });
});
