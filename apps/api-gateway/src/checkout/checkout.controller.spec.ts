import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { of, throwError, TimeoutError } from 'rxjs';
import type { Request } from 'express';
import { SERVICE_NAMES, MESSAGE_PATTERNS } from '@cyna-api/common';
import { CheckoutController } from './checkout.controller';
import { OptionalJwtAuthGuard } from '../auth/guards';
import { CheckoutPaymentIntentDto } from './dto/checkout-payment-intent.dto';
import {
  createMockClientProxy,
  MockClientProxy,
} from '../../../../libs/common/test/mocks/rabbitmq.mock';

const baseBody = (): CheckoutPaymentIntentDto =>
  ({
    cartId: 'cart-1',
    billingAddress: {
      firstName: 'Tom',
      lastName: 'Y',
      line1: '1 rue',
      city: 'Paris',
      postalCode: '75000',
      country: 'FR',
    },
  }) as unknown as CheckoutPaymentIntentDto;

const reqWithUser = (user?: { id: string; email: string; type: string }) =>
  ({ user }) as unknown as Request & { user?: { id: string; email: string; type: string } };

describe('CheckoutController', () => {
  let controller: CheckoutController;
  let orderClient: MockClientProxy;
  let paymentClient: MockClientProxy;

  beforeEach(async () => {
    orderClient = createMockClientProxy(null);
    paymentClient = createMockClientProxy(null);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CheckoutController],
      providers: [
        { provide: SERVICE_NAMES.ORDER, useValue: orderClient },
        { provide: SERVICE_NAMES.PAYMENT, useValue: paymentClient },
      ],
    })
      .overrideGuard(OptionalJwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get(CheckoutController);
  });

  describe('createPaymentIntent — happy path', () => {
    it('should call order then payment service and return PaymentIntent payload', async () => {
      const order = {
        id: 'order-1',
        orderNumber: 'CYNA-001',
        total: 9900,
        currency: 'EUR',
        stripePaymentIntentId: '',
      };
      const intent = {
        clientSecret: 'cs_secret',
        paymentIntentId: 'pi_1',
        amount: 9900,
        currency: 'EUR',
      };
      orderClient.send.mockReturnValueOnce(of(order));
      paymentClient.send.mockReturnValueOnce(of(intent));

      const result = await controller.createPaymentIntent(
        { ...baseBody(), email: 'cust@cyna.io' } as CheckoutPaymentIntentDto,
        reqWithUser({ id: 'u-1', email: 'auth@cyna.io', type: 'user' }),
      );

      expect(orderClient.send).toHaveBeenCalledWith(
        MESSAGE_PATTERNS.ORDER.CREATE_ORDER,
        expect.objectContaining({
          userId: 'u-1',
          cartId: 'cart-1',
          email: 'auth@cyna.io', // JWT email is authoritative
        }),
      );
      expect(paymentClient.send).toHaveBeenCalledWith(
        MESSAGE_PATTERNS.PAYMENT.CREATE_PAYMENT_INTENT,
        expect.objectContaining({ orderId: 'order-1', amount: 9900, currency: 'EUR' }),
      );
      expect(result).toEqual({
        clientSecret: 'cs_secret',
        paymentIntentId: 'pi_1',
        orderId: 'order-1',
        orderNumber: 'CYNA-001',
        amount: 9900,
        currency: 'EUR',
      });
    });

    it('should accept guest checkout when body.email is provided and user is undefined', async () => {
      const order = {
        id: 'o',
        orderNumber: 'N',
        total: 1000,
        currency: 'EUR',
        stripePaymentIntentId: '',
      };
      orderClient.send.mockReturnValueOnce(of(order));
      paymentClient.send.mockReturnValueOnce(
        of({ clientSecret: 's', paymentIntentId: 'pi', amount: 1000, currency: 'EUR' }),
      );

      const result = await controller.createPaymentIntent(
        { ...baseBody(), email: 'guest@cyna.io' } as CheckoutPaymentIntentDto,
        reqWithUser(undefined),
      );

      expect(orderClient.send).toHaveBeenCalledWith(
        MESSAGE_PATTERNS.ORDER.CREATE_ORDER,
        expect.objectContaining({ userId: undefined, email: 'guest@cyna.io' }),
      );
      expect(result.paymentIntentId).toBe('pi');
    });

    it('should accept legacy body.guestEmail when no email and no JWT', async () => {
      orderClient.send.mockReturnValueOnce(
        of({ id: 'o', orderNumber: 'N', total: 1, currency: 'EUR', stripePaymentIntentId: '' }),
      );
      paymentClient.send.mockReturnValueOnce(
        of({ clientSecret: 's', paymentIntentId: 'pi', amount: 1, currency: 'EUR' }),
      );

      await controller.createPaymentIntent(
        { ...baseBody(), guestEmail: 'legacy@cyna.io' } as CheckoutPaymentIntentDto,
        reqWithUser(undefined),
      );

      expect(orderClient.send).toHaveBeenCalledWith(
        MESSAGE_PATTERNS.ORDER.CREATE_ORDER,
        expect.objectContaining({ email: 'legacy@cyna.io' }),
      );
    });
  });

  describe('validation', () => {
    it('should throw BadRequestException when no email is resolvable (guest without email)', async () => {
      await expect(
        controller.createPaymentIntent(baseBody(), reqWithUser(undefined)),
      ).rejects.toThrow(BadRequestException);
      expect(orderClient.send).not.toHaveBeenCalled();
    });
  });

  describe('order service failures', () => {
    it('should propagate a downstream RpcException with its statusCode', async () => {
      orderClient.send.mockReturnValueOnce(
        throwError(() => ({ statusCode: 400, message: 'errors.cart.empty', code: 'CART_EMPTY' })),
      );

      await expect(
        controller.createPaymentIntent(
          { ...baseBody(), email: 'a@b.com' } as CheckoutPaymentIntentDto,
          reqWithUser({ id: 'u', email: 'a@b.com', type: 'user' }),
        ),
      ).rejects.toMatchObject({ statusCode: 400, message: 'errors.cart.empty' });
    });

    it('should map order-service timeout to a 503 ServiceUnavailable-shaped error', async () => {
      // The controller maps any RxJS TimeoutError emitted by the source observable
      // to { statusCode: 503, message: 'Order service timeout' }.
      // Returning a TimeoutError directly is equivalent for the catchError branch
      // and avoids 10s+ real waits / fake-timer flakiness with async/await.
      orderClient.send.mockReturnValue(throwError(() => new TimeoutError()));

      await expect(
        controller.createPaymentIntent(
          { ...baseBody(), email: 'a@b.com' } as CheckoutPaymentIntentDto,
          reqWithUser({ id: 'u', email: 'a@b.com', type: 'user' }),
        ),
      ).rejects.toMatchObject({ statusCode: 503, message: 'Order service timeout' });
    });
  });

  describe('payment service failures', () => {
    it('should map payment-service timeout to a 503 ServiceUnavailable-shaped error', async () => {
      orderClient.send.mockReturnValueOnce(
        of({ id: 'o', orderNumber: 'N', total: 100, currency: 'EUR', stripePaymentIntentId: '' }),
      );
      paymentClient.send.mockReturnValue(throwError(() => new TimeoutError()));

      await expect(
        controller.createPaymentIntent(
          { ...baseBody(), email: 'a@b.com' } as CheckoutPaymentIntentDto,
          reqWithUser({ id: 'u', email: 'a@b.com', type: 'user' }),
        ),
      ).rejects.toMatchObject({ statusCode: 503, message: 'Payment service timeout' });
    });

    it('should propagate a downstream RpcException from payment-service', async () => {
      orderClient.send.mockReturnValueOnce(
        of({ id: 'o', orderNumber: 'N', total: 100, currency: 'EUR', stripePaymentIntentId: '' }),
      );
      paymentClient.send.mockReturnValueOnce(
        throwError(() => ({
          statusCode: 402,
          message: 'errors.payment.failed',
          code: 'PAYMENT_FAILED',
        })),
      );

      await expect(
        controller.createPaymentIntent(
          { ...baseBody(), email: 'a@b.com' } as CheckoutPaymentIntentDto,
          reqWithUser({ id: 'u', email: 'a@b.com', type: 'user' }),
        ),
      ).rejects.toMatchObject({ statusCode: 402, code: 'PAYMENT_FAILED' });
    });
  });

  describe('reuse of existing PaymentIntent (idempotency)', () => {
    it('should reuse the existing reusable PaymentIntent without creating a new one', async () => {
      orderClient.send.mockReturnValueOnce(
        of({
          id: 'o',
          orderNumber: 'N',
          total: 100,
          currency: 'EUR',
          stripePaymentIntentId: 'pi_existing',
        }),
      );
      // First payment call → RETRIEVE_PAYMENT_INTENT returns a reusable intent
      paymentClient.send.mockReturnValueOnce(
        of({
          reusable: true,
          clientSecret: 'cs_existing',
          paymentIntentId: 'pi_existing',
          amount: 100,
          currency: 'EUR',
        }),
      );

      const result = await controller.createPaymentIntent(
        { ...baseBody(), email: 'a@b.com' } as CheckoutPaymentIntentDto,
        reqWithUser({ id: 'u', email: 'a@b.com', type: 'user' }),
      );

      expect(paymentClient.send).toHaveBeenCalledTimes(1);
      expect(paymentClient.send).toHaveBeenCalledWith(
        MESSAGE_PATTERNS.PAYMENT.RETRIEVE_PAYMENT_INTENT,
        { paymentIntentId: 'pi_existing' },
      );
      expect(result.paymentIntentId).toBe('pi_existing');
      expect(result.clientSecret).toBe('cs_existing');
    });

    it('should fall back to CREATE_PAYMENT_INTENT when RETRIEVE throws', async () => {
      orderClient.send.mockReturnValueOnce(
        of({
          id: 'o',
          orderNumber: 'N',
          total: 100,
          currency: 'EUR',
          stripePaymentIntentId: 'pi_existing',
        }),
      );
      // First payment call (RETRIEVE) → error: catchError swallows + falls through
      paymentClient.send
        .mockReturnValueOnce(throwError(() => new Error('rpc unavailable')))
        .mockReturnValueOnce(
          of({
            clientSecret: 'cs_new',
            paymentIntentId: 'pi_new',
            amount: 100,
            currency: 'EUR',
          }),
        );

      const result = await controller.createPaymentIntent(
        { ...baseBody(), email: 'a@b.com' } as CheckoutPaymentIntentDto,
        reqWithUser({ id: 'u', email: 'a@b.com', type: 'user' }),
      );

      expect(paymentClient.send).toHaveBeenCalledTimes(2);
      expect(result.paymentIntentId).toBe('pi_new');
    });

    it('should fall back to CREATE_PAYMENT_INTENT when retrieve returns non-reusable', async () => {
      orderClient.send.mockReturnValueOnce(
        of({
          id: 'o',
          orderNumber: 'N',
          total: 100,
          currency: 'EUR',
          stripePaymentIntentId: 'pi_stale',
        }),
      );
      paymentClient.send
        .mockReturnValueOnce(of({ reusable: false, paymentIntentId: 'pi_stale' }))
        .mockReturnValueOnce(
          of({
            clientSecret: 'cs_new',
            paymentIntentId: 'pi_new',
            amount: 100,
            currency: 'EUR',
          }),
        );

      const result = await controller.createPaymentIntent(
        { ...baseBody(), email: 'a@b.com' } as CheckoutPaymentIntentDto,
        reqWithUser({ id: 'u', email: 'a@b.com', type: 'user' }),
      );

      expect(paymentClient.send).toHaveBeenCalledTimes(2);
      expect(result.paymentIntentId).toBe('pi_new');
    });
  });
});
