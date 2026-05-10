import { Test, TestingModule } from '@nestjs/testing';
import { RpcException } from '@nestjs/microservices';
import { of } from 'rxjs';
import { PaymentService } from './payment.service';
import { StripeService } from './stripe.service';
import { SubscriptionService } from './subscription.service';
import {
  SERVICE_NAMES,
  MESSAGE_PATTERNS,
  SubscriptionStatus,
  BillingPeriod,
} from '@cyna-api/common';

describe('PaymentService', () => {
  let service: PaymentService;
  let stripeService: Partial<StripeService>;
  let subscriptionService: Partial<SubscriptionService>;
  let catalogClient: { send: jest.Mock };
  let userClient: { send: jest.Mock; emit: jest.Mock };

  const mockProduct = {
    id: 'prod-1',
    price: '49.99',
    priceMonthly: '49.99',
    priceYearly: '499.99',
    productType: 'license',
    stripePriceId: 'price_default',
    stripePriceIdMonthly: 'price_monthly',
    stripePriceIdYearly: 'price_yearly',
    nameFr: 'Produit Test',
    nameEn: 'Test Product',
    slug: 'test-product',
  };

  beforeEach(async () => {
    stripeService = {
      createPaymentIntent: jest.fn().mockResolvedValue({
        id: 'pi_test_123',
        client_secret: 'pi_test_123_secret_xxx',
        amount: 12997,
        currency: 'eur',
      }),
      createCustomer: jest.fn().mockResolvedValue({
        id: 'cus_new_123',
        email: 'test@example.com',
      }),
      createSubscription: jest.fn().mockResolvedValue({
        id: 'sub_stripe_new',
        current_period_start: Math.floor(Date.now() / 1000),
        current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 3600,
        latest_invoice: {
          confirmation_secret: {
            client_secret: 'pi_sub_secret_xxx',
          },
        },
      }),
      getInvoice: jest.fn(),
    };

    subscriptionService = {
      create: jest.fn().mockResolvedValue({
        id: 'local-sub-1',
        stripeSubscriptionId: 'sub_stripe_new',
      }),
    };

    catalogClient = {
      send: jest.fn(),
    };

    userClient = {
      send: jest.fn(),
      emit: jest.fn(),
    };

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

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createPaymentIntent', () => {
    it('should create a payment intent with the provided amount', async () => {
      const result = await service.createPaymentIntent({
        orderId: 'order-1',
        amount: 129.97,
        currency: 'EUR',
        userId: 'user-1',
      });

      expect(result.clientSecret).toBe('pi_test_123_secret_xxx');
      expect(result.paymentIntentId).toBe('pi_test_123');
      expect(result.currency).toBe('eur');

      // 129.97 * 100 = 12997 cents
      expect(stripeService.createPaymentIntent).toHaveBeenCalledWith(
        12997,
        'eur',
        expect.objectContaining({ orderId: 'order-1', userId: 'user-1' }),
        expect.anything(),
      );
    });

    it('should throw when amount is zero or negative', async () => {
      await expect(
        service.createPaymentIntent({
          orderId: 'order-1',
          amount: 0,
        }),
      ).rejects.toThrow(RpcException);
    });

    it('should set empty string for userId and guestEmail in metadata when not provided', async () => {
      await service.createPaymentIntent({
        orderId: 'order-1',
        amount: 10.0,
      });

      expect(stripeService.createPaymentIntent).toHaveBeenCalledWith(
        1000,
        'eur',
        expect.objectContaining({ userId: '', guestEmail: '' }),
        expect.anything(),
      );
    });
  });

  describe('createSubscription', () => {
    it('should create subscription when user has stripeCustomerId', async () => {
      userClient.send.mockReturnValue(
        of({
          id: 'user-1',
          email: 'user@test.com',
          stripeCustomerId: 'cus_existing',
        }),
      );
      catalogClient.send.mockReturnValue(of(mockProduct));

      const result = await service.createSubscription({
        userId: 'user-1',
        productId: 'prod-1',
        billingPeriod: BillingPeriod.MONTHLY,
        billingAddress: {
          street: '1 Rue',
          city: 'Paris',
          postalCode: '75001',
          country: 'FR',
        },
      });

      expect(result.clientSecret).toBe('pi_sub_secret_xxx');
      expect(result.subscriptionId).toBe('local-sub-1');
      expect(stripeService.createCustomer).not.toHaveBeenCalled();
      expect(stripeService.createSubscription).toHaveBeenCalledWith(
        'cus_existing',
        'price_monthly',
        expect.any(Object),
      );
    });

    it('should create Stripe customer when user has no stripeCustomerId', async () => {
      userClient.send.mockReturnValue(
        of({
          id: 'user-1',
          email: 'user@test.com',
          name: 'Test User',
          stripeCustomerId: null,
        }),
      );
      catalogClient.send.mockReturnValue(of(mockProduct));

      await service.createSubscription({
        userId: 'user-1',
        productId: 'prod-1',
        billingPeriod: BillingPeriod.MONTHLY,
        billingAddress: {
          street: '1 Rue',
          city: 'Paris',
          postalCode: '75001',
          country: 'FR',
        },
      });

      expect(stripeService.createCustomer).toHaveBeenCalledWith('user@test.com', 'Test User', {
        userId: 'user-1',
      });
      expect(userClient.emit).toHaveBeenCalledWith(
        MESSAGE_PATTERNS.USER.UPDATE_STRIPE_CUSTOMER_ID,
        {
          userId: 'user-1',
          stripeCustomerId: 'cus_new_123',
        },
      );
    });

    it('should use yearly price for yearly billing period', async () => {
      userClient.send.mockReturnValue(
        of({
          id: 'user-1',
          email: 'user@test.com',
          stripeCustomerId: 'cus_existing',
        }),
      );
      catalogClient.send.mockReturnValue(of(mockProduct));

      await service.createSubscription({
        userId: 'user-1',
        productId: 'prod-1',
        billingPeriod: BillingPeriod.YEARLY,
        billingAddress: {
          street: '1 Rue',
          city: 'Paris',
          postalCode: '75001',
          country: 'FR',
        },
      });

      expect(stripeService.createSubscription).toHaveBeenCalledWith(
        'cus_existing',
        'price_yearly',
        expect.any(Object),
      );
    });

    it('should throw when product not found', async () => {
      userClient.send.mockReturnValue(
        of({
          id: 'user-1',
          email: 'user@test.com',
          stripeCustomerId: 'cus_existing',
        }),
      );
      catalogClient.send.mockReturnValue(of(null));

      await expect(
        service.createSubscription({
          userId: 'user-1',
          productId: 'prod-missing',
          billingPeriod: BillingPeriod.MONTHLY,
          billingAddress: {
            street: '1 Rue',
            city: 'Paris',
            postalCode: '75001',
            country: 'FR',
          },
        }),
      ).rejects.toThrow(RpcException);
    });

    it('should throw when product has no stripePriceId', async () => {
      userClient.send.mockReturnValue(
        of({
          id: 'user-1',
          email: 'user@test.com',
          stripeCustomerId: 'cus_existing',
        }),
      );
      catalogClient.send.mockReturnValue(
        of({
          ...mockProduct,
          stripePriceId: null,
          stripePriceIdMonthly: null,
          stripePriceIdYearly: null,
        }),
      );

      await expect(
        service.createSubscription({
          userId: 'user-1',
          productId: 'prod-1',
          billingPeriod: BillingPeriod.MONTHLY,
          billingAddress: {
            street: '1 Rue',
            city: 'Paris',
            postalCode: '75001',
            country: 'FR',
          },
        }),
      ).rejects.toThrow(RpcException);
    });

    it('should throw when subscription has no clientSecret', async () => {
      userClient.send.mockReturnValue(
        of({
          id: 'user-1',
          email: 'user@test.com',
          stripeCustomerId: 'cus_existing',
        }),
      );
      catalogClient.send.mockReturnValue(of(mockProduct));
      (stripeService.createSubscription as jest.Mock).mockResolvedValueOnce({
        id: 'sub_stripe_new',
        latest_invoice: {
          confirmation_secret: null,
        },
      });

      await expect(
        service.createSubscription({
          userId: 'user-1',
          productId: 'prod-1',
          billingPeriod: BillingPeriod.MONTHLY,
          billingAddress: {
            street: '1 Rue',
            city: 'Paris',
            postalCode: '75001',
            country: 'FR',
          },
        }),
      ).rejects.toThrow(RpcException);
    });

    it('should save subscription with correct data in database', async () => {
      userClient.send.mockReturnValue(
        of({
          id: 'user-1',
          email: 'user@test.com',
          stripeCustomerId: 'cus_existing',
        }),
      );
      catalogClient.send.mockReturnValue(of(mockProduct));

      await service.createSubscription({
        userId: 'user-1',
        productId: 'prod-1',
        billingPeriod: BillingPeriod.MONTHLY,
        billingAddress: {
          street: '1 Rue',
          city: 'Paris',
          postalCode: '75001',
          country: 'FR',
        },
      });

      expect(subscriptionService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          productId: 'prod-1',
          status: SubscriptionStatus.ACTIVE,
          billingPeriod: 'monthly',
          price: expect.any(Number),
          currency: 'EUR',
          stripeSubscriptionId: 'sub_stripe_new',
          stripeCustomerId: 'cus_existing',
          stripePriceId: 'price_monthly',
        }),
      );
    });
  });

  describe('getSubscriptionsForUser (admin mode)', () => {
    const baseSub = {
      id: 'sub-1',
      userId: 'user-1',
      productId: 'prod-1',
      productName: 'Existing Name',
      stripeSubscriptionId: 'sub_stripe_1',
      status: SubscriptionStatus.ACTIVE,
      billingPeriod: 'monthly' as const,
      cancelAtPeriodEnd: false,
      currentPeriodStart: new Date(),
      currentPeriodEnd: new Date(Date.now() + 30 * 24 * 3600 * 1000),
    };

    beforeEach(() => {
      subscriptionService.findAllAdmin = jest
        .fn()
        .mockResolvedValue({ items: [baseSub], total: 1, page: 1, limit: 20 });
      // Stripe sync is best-effort; throwing is fine, the service catches.
      stripeService.getSubscription = jest.fn().mockRejectedValue(new Error('skip'));
      catalogClient.send.mockReturnValue(of(mockProduct));
    });

    it('enriches each row with customerEmail from USER.GET_BY_ID', async () => {
      userClient.send.mockImplementation((pattern: { cmd: string }) => {
        if (pattern.cmd === MESSAGE_PATTERNS.USER.GET_BY_ID.cmd) {
          return of({ id: 'user-1', email: 'admin-customer@example.com' });
        }
        return of(null);
      });

      const result = (await service.getSubscriptionsForUser(undefined, {
        adminMode: true,
        page: 1,
        limit: 20,
      })) as { data: Record<string, unknown>[] };

      expect(userClient.send).toHaveBeenCalledWith(MESSAGE_PATTERNS.USER.GET_BY_ID, {
        userId: 'user-1',
      });
      expect(result.data[0]).toEqual(
        expect.objectContaining({ customerEmail: 'admin-customer@example.com' }),
      );
    });

    it('falls back to customerEmail: null when user-service returns null', async () => {
      userClient.send.mockReturnValue(of(null));

      const result = (await service.getSubscriptionsForUser(undefined, {
        adminMode: true,
      })) as { data: Record<string, unknown>[] };

      expect(result.data[0]).toEqual(expect.objectContaining({ customerEmail: null }));
    });

    it('does not call USER.GET_BY_ID in non-admin mode', async () => {
      (subscriptionService as Partial<SubscriptionService>).findByUserId = jest
        .fn()
        .mockResolvedValue([baseSub]);

      const result = (await service.getSubscriptionsForUser('user-1', {
        adminMode: false,
      })) as Record<string, unknown>[];

      expect(userClient.send).not.toHaveBeenCalled();
      expect(result[0]).not.toHaveProperty('customerEmail');
    });
  });
});
