/**
 * Extra coverage for PaymentService — targets the uncovered ranges:
 *   - resolveOrCreateCustomer paths (guest, existing user, user-without-stripe,
 *     user-service error, guestEmail fallback)
 *   - retrievePaymentIntent (reusable / terminal statuses)
 *   - getSubscriptionsForUser non-admin path + Stripe sync branches + product
 *     name auto-fill
 *   - mapStripeStatus
 *   - createSubscription RxJS timeout/retry branches (USER_SERVICE_TIMEOUT,
 *     CATALOG_SERVICE_TIMEOUT)
 */
import { Test, TestingModule } from '@nestjs/testing';
import { RpcException } from '@nestjs/microservices';
import { of, throwError, TimeoutError } from 'rxjs';

import { PaymentService } from './payment.service';
import { StripeService } from './stripe.service';
import { SubscriptionService } from './subscription.service';
import {
  SERVICE_NAMES,
  MESSAGE_PATTERNS,
  SubscriptionStatus,
  BillingPeriod,
} from '@cyna-api/common';

describe('PaymentService (extra coverage)', () => {
  let service: PaymentService;
  let stripeService: Partial<StripeService>;
  let subscriptionService: Partial<SubscriptionService>;
  let catalogClient: { send: jest.Mock };
  let userClient: { send: jest.Mock; emit: jest.Mock };

  beforeEach(async () => {
    stripeService = {
      createPaymentIntent: jest.fn().mockResolvedValue({
        id: 'pi_x',
        client_secret: 'pi_x_secret',
        amount: 1000,
        currency: 'eur',
      }),
      getPaymentIntent: jest.fn(),
      createCustomer: jest.fn().mockResolvedValue({ id: 'cus_created' }),
      createSubscription: jest.fn(),
      getSubscription: jest.fn(),
      getInvoice: jest.fn(),
    };

    subscriptionService = {
      create: jest.fn().mockResolvedValue({ id: 'local-sub-1' }),
      findByUserId: jest.fn().mockResolvedValue([]),
      findAll: jest.fn().mockResolvedValue([]),
      findAllAdmin: jest.fn().mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 }),
      update: jest.fn().mockResolvedValue(undefined),
    };

    catalogClient = { send: jest.fn() };
    userClient = { send: jest.fn(), emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentService,
        { provide: StripeService, useValue: stripeService },
        { provide: SubscriptionService, useValue: subscriptionService },
        { provide: SERVICE_NAMES.CATALOG, useValue: catalogClient },
        { provide: SERVICE_NAMES.USER, useValue: userClient },
      ],
    }).compile();

    service = module.get<PaymentService>(PaymentService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('createPaymentIntent — resolveOrCreateCustomer branches', () => {
    it('reuses existing stripeCustomerId from user service', async () => {
      userClient.send.mockReturnValue(
        of({ id: 'user-1', email: 'u@u.com', stripeCustomerId: 'cus_existing' }),
      );

      await service.createPaymentIntent({
        orderId: 'o-1',
        amount: 10,
        userId: 'user-1',
      });

      expect(stripeService.createCustomer).not.toHaveBeenCalled();
      expect(stripeService.createPaymentIntent).toHaveBeenCalledWith(
        1000,
        'eur',
        expect.any(Object),
        expect.objectContaining({ customerId: 'cus_existing' }),
      );
    });

    it('creates a new Stripe customer when user has email but no stripeCustomerId and persists it via emit', async () => {
      userClient.send.mockReturnValue(
        of({ id: 'user-1', email: 'u@u.com', name: 'Tom', stripeCustomerId: null }),
      );

      await service.createPaymentIntent({
        orderId: 'o-1',
        amount: 25,
        userId: 'user-1',
      });

      expect(stripeService.createCustomer).toHaveBeenCalledWith('u@u.com', 'Tom', {
        userId: 'user-1',
      });
      expect(userClient.emit).toHaveBeenCalledWith(
        MESSAGE_PATTERNS.USER.UPDATE_STRIPE_CUSTOMER_ID,
        { userId: 'user-1', stripeCustomerId: 'cus_created' },
      );
    });

    it('falls back to email-as-name when user has no name', async () => {
      userClient.send.mockReturnValue(
        of({ id: 'user-1', email: 'u@u.com', stripeCustomerId: null }),
      );

      await service.createPaymentIntent({
        orderId: 'o-1',
        amount: 25,
        userId: 'user-1',
      });

      expect(stripeService.createCustomer).toHaveBeenCalledWith('u@u.com', 'u@u.com', {
        userId: 'user-1',
      });
    });

    it('creates Stripe customer from guestEmail when no userId', async () => {
      await service.createPaymentIntent({
        orderId: 'o-1',
        amount: 25,
        guestEmail: 'guest@x.com',
      });

      expect(stripeService.createCustomer).toHaveBeenCalledWith('guest@x.com', 'guest@x.com', {
        guest: 'true',
        orderId: 'o-1',
      });
      expect(stripeService.createPaymentIntent).toHaveBeenCalledWith(
        2500,
        'eur',
        expect.any(Object),
        expect.objectContaining({ customerId: 'cus_created' }),
      );
    });

    it('proceeds without customer id when user service is unavailable (best-effort)', async () => {
      userClient.send.mockReturnValue(throwError(() => new Error('user svc down')));

      const result = await service.createPaymentIntent({
        orderId: 'o-1',
        amount: 10,
        userId: 'user-1',
      });

      expect(result.clientSecret).toBe('pi_x_secret');
      // Either undefined customerId or no customer attached; the key invariant
      // is that checkout proceeded despite the upstream failure.
      const piCall = (stripeService.createPaymentIntent as jest.Mock).mock.calls[0];
      expect(piCall[3].customerId).toBeUndefined();
    });

    it('returns undefined customerId when neither userId nor guestEmail is set', async () => {
      await service.createPaymentIntent({
        orderId: 'o-1',
        amount: 10,
      });

      const piCall = (stripeService.createPaymentIntent as jest.Mock).mock.calls[0];
      expect(piCall[3].customerId).toBeUndefined();
    });

    it('uses provided currency lowercased when DTO sends uppercase', async () => {
      await service.createPaymentIntent({
        orderId: 'o-1',
        amount: 10,
        currency: 'USD',
      });
      const piCall = (stripeService.createPaymentIntent as jest.Mock).mock.calls[0];
      expect(piCall[1]).toBe('usd');
    });
  });

  describe('retrievePaymentIntent', () => {
    it('returns reusable=true when intent is requires_payment_method', async () => {
      (stripeService.getPaymentIntent as jest.Mock).mockResolvedValueOnce({
        id: 'pi_1',
        client_secret: 'pi_1_secret',
        status: 'requires_payment_method',
        amount: 5000,
        currency: 'eur',
      });

      const result = await service.retrievePaymentIntent('pi_1');

      expect(result.reusable).toBe(true);
      expect(result.clientSecret).toBe('pi_1_secret');
    });

    it.each(['requires_confirmation', 'requires_action'])(
      'returns reusable=true when status is %s',
      async (status) => {
        (stripeService.getPaymentIntent as jest.Mock).mockResolvedValueOnce({
          id: 'pi_1',
          client_secret: 'sec',
          status,
          amount: 100,
          currency: 'eur',
        });
        const result = await service.retrievePaymentIntent('pi_1');
        expect(result.reusable).toBe(true);
      },
    );

    it('returns reusable=false when intent is in a terminal state', async () => {
      (stripeService.getPaymentIntent as jest.Mock).mockResolvedValueOnce({
        id: 'pi_done',
        status: 'succeeded',
        amount: 100,
        currency: 'eur',
      });
      const result = await service.retrievePaymentIntent('pi_done');
      expect(result.reusable).toBe(false);
      // No client_secret in payload → service falls back to ''
      expect(result.clientSecret).toBe('');
    });
  });

  describe('getSubscriptionsForUser — non-admin path', () => {
    // The DB row is the source of truth for the listing — Stripe webhooks
    // keep status / period / cancelAtPeriodEnd in sync as they happen. The
    // listing must NOT call Stripe per row (the old behavior added a
    // 100-200 ms RTT × N to the admin page).
    const makeSub = () => ({
      id: 'sub-1',
      userId: 'user-1',
      productId: 'prod-1',
      productName: null,
      stripeSubscriptionId: 'sub_stripe_1',
      status: SubscriptionStatus.ACTIVE,
      billingPeriod: 'monthly',
      cancelAtPeriodEnd: false,
      currentPeriodStart: new Date('2026-01-01'),
      currentPeriodEnd: new Date('2026-02-01'),
    });

    beforeEach(() => {
      (subscriptionService.findByUserId as jest.Mock).mockResolvedValue([makeSub()]);
    });

    it('does not call Stripe per row when listing — DB is the source of truth', async () => {
      catalogClient.send.mockReturnValueOnce(of({ id: 'prod-1', nameFr: 'SOC Pro' }));

      const result = (await service.getSubscriptionsForUser('user-1')) as Record<string, unknown>[];

      expect(stripeService.getSubscription).not.toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0].status).toBe(SubscriptionStatus.ACTIVE);
    });

    it('persists a missing productName back to the row after catalog lookup', async () => {
      catalogClient.send.mockReturnValueOnce(of({ id: 'prod-1', nameFr: 'SOC Pro' }));

      await service.getSubscriptionsForUser('user-1');

      expect(subscriptionService.update).toHaveBeenCalledWith(
        'sub-1',
        expect.objectContaining({ productName: 'SOC Pro' }),
      );
    });

    it('picks the primary image from product.images when primaryImageUrl is absent', async () => {
      catalogClient.send.mockReturnValueOnce(
        of({
          id: 'prod-1',
          nameFr: 'X',
          images: [
            { imageUrl: 'http://img/secondary.png', isPrimary: false },
            { imageUrl: 'http://img/primary.png', isPrimary: true },
          ],
        }),
      );

      const result = (await service.getSubscriptionsForUser('user-1')) as Record<string, unknown>[];

      expect(result[0].productImageUrl).toBe('http://img/primary.png');
    });

    it('picks the first image when none is flagged primary', async () => {
      catalogClient.send.mockReturnValueOnce(
        of({
          id: 'prod-1',
          nameFr: 'X',
          images: [{ imageUrl: 'http://img/first.png', isPrimary: false }],
        }),
      );

      const result = (await service.getSubscriptionsForUser('user-1')) as Record<string, unknown>[];

      expect(result[0].productImageUrl).toBe('http://img/first.png');
    });

    it('falls back to legacy adminMode-as-boolean argument (backward compat)', async () => {
      (subscriptionService.findAllAdmin as jest.Mock).mockResolvedValueOnce({
        items: [],
        total: 0,
        page: 1,
        limit: 20,
      });
      const result = await service.getSubscriptionsForUser(undefined, true);
      expect(result).toEqual(expect.objectContaining({ data: [], total: 0, page: 1, limit: 20 }));
    });
  });

  describe('createSubscription — RxJS error branches', () => {
    it('wraps a user-service TimeoutError into USER_SERVICE_TIMEOUT 503', async () => {
      userClient.send.mockReturnValue(throwError(() => new TimeoutError()));

      try {
        await service.createSubscription({
          userId: 'u-1',
          productId: 'p-1',
          billingPeriod: BillingPeriod.MONTHLY,
          billingAddress: {
            street: '1',
            city: 'Paris',
            postalCode: '75001',
            country: 'FR',
          },
        });
        fail('expected RpcException');
      } catch (err) {
        const rpcError = (err as RpcException).getError() as Record<string, unknown>;
        expect(rpcError.code).toBe('USER_SERVICE_TIMEOUT');
        expect(rpcError.statusCode).toBe(503);
      }
    });

    it('wraps a catalog-service TimeoutError into CATALOG_SERVICE_TIMEOUT 503', async () => {
      userClient.send.mockReturnValue(
        of({ id: 'u-1', email: 'u@u.com', stripeCustomerId: 'cus_1' }),
      );
      catalogClient.send.mockReturnValue(throwError(() => new TimeoutError()));

      try {
        await service.createSubscription({
          userId: 'u-1',
          productId: 'p-1',
          billingPeriod: BillingPeriod.MONTHLY,
          billingAddress: {
            street: '1',
            city: 'Paris',
            postalCode: '75001',
            country: 'FR',
          },
        });
        fail('expected RpcException');
      } catch (err) {
        const rpcError = (err as RpcException).getError() as Record<string, unknown>;
        expect(rpcError.code).toBe('CATALOG_SERVICE_TIMEOUT');
        expect(rpcError.statusCode).toBe(503);
      }
    });

    it('propagates non-timeout errors from user service as-is', async () => {
      userClient.send.mockReturnValue(throwError(() => new Error('boom')));
      await expect(
        service.createSubscription({
          userId: 'u-1',
          productId: 'p-1',
          billingPeriod: BillingPeriod.MONTHLY,
          billingAddress: { street: '1', city: 'P', postalCode: '1', country: 'FR' },
        }),
      ).rejects.toThrow('boom');
    });

    it('throws SUBSCRIPTION_NO_INVOICE when Stripe returns a subscription with no invoice', async () => {
      userClient.send.mockReturnValue(
        of({ id: 'u-1', email: 'u@u.com', stripeCustomerId: 'cus_1' }),
      );
      catalogClient.send.mockReturnValue(
        of({
          id: 'p-1',
          stripePriceIdMonthly: 'price_m',
          priceMonthly: '10',
          priceYearly: '100',
        }),
      );
      (stripeService.createSubscription as jest.Mock).mockResolvedValueOnce({
        id: 'sub_no_inv',
        latest_invoice: null,
      });

      try {
        await service.createSubscription({
          userId: 'u-1',
          productId: 'p-1',
          billingPeriod: BillingPeriod.MONTHLY,
          billingAddress: { street: '1', city: 'P', postalCode: '1', country: 'FR' },
        });
        fail('expected RpcException');
      } catch (err) {
        const rpcError = (err as RpcException).getError() as Record<string, unknown>;
        expect(rpcError.code).toBe('SUBSCRIPTION_NO_INVOICE');
      }
    });

    it('fetches invoice when latest_invoice is a string id', async () => {
      userClient.send.mockReturnValue(
        of({ id: 'u-1', email: 'u@u.com', stripeCustomerId: 'cus_1' }),
      );
      catalogClient.send.mockReturnValue(
        of({
          id: 'p-1',
          stripePriceIdMonthly: 'price_m',
          stripePriceIdYearly: 'price_y',
          priceMonthly: '10',
          priceYearly: '100',
        }),
      );
      (stripeService.createSubscription as jest.Mock).mockResolvedValueOnce({
        id: 'sub_new',
        latest_invoice: 'in_id_str',
      });
      (stripeService.getInvoice as jest.Mock).mockResolvedValueOnce({
        id: 'in_id_str',
        confirmation_secret: { client_secret: 'sec_xx' },
      });

      const result = await service.createSubscription({
        userId: 'u-1',
        productId: 'p-1',
        billingPeriod: BillingPeriod.MONTHLY,
        billingAddress: { street: '1', city: 'P', postalCode: '1', country: 'FR' },
      });

      expect(stripeService.getInvoice).toHaveBeenCalledWith('in_id_str');
      expect(result.clientSecret).toBe('sec_xx');
    });
  });
});
