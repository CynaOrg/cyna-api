import { Test, TestingModule } from '@nestjs/testing';
import { RpcException } from '@nestjs/microservices';
import { of, throwError } from 'rxjs';
import { PaymentService } from './payment.service';
import { StripeService } from './stripe.service';
import { SubscriptionService } from './subscription.service';
import { SERVICE_NAMES, MESSAGE_PATTERNS, SubscriptionStatus } from '@cyna-api/common';

describe('PaymentService', () => {
  let service: PaymentService;
  let stripeService: Partial<StripeService>;
  let subscriptionService: Partial<SubscriptionService>;
  let orderClient: { send: jest.Mock; emit: jest.Mock };
  let catalogClient: { send: jest.Mock };
  let authClient: { send: jest.Mock; emit: jest.Mock };

  const mockProduct = {
    id: 'prod-1',
    price: '49.99',
    productType: 'license',
    stripePriceId: 'price_default',
    stripePriceIdMonthly: 'price_monthly',
    stripePriceIdYearly: 'price_yearly',
    nameFr: 'Produit Test',
    nameEn: 'Test Product',
    slug: 'test-product',
  };

  const mockCart = {
    id: 'cart-1',
    items: [
      { productId: 'prod-1', quantity: 2 },
      { productId: 'prod-2', quantity: 1 },
    ],
  };

  const mockProducts = [
    { id: 'prod-1', price: '49.99', productType: 'license' },
    { id: 'prod-2', price: '29.99', productType: 'physical' },
  ];

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
          payment_intent: {
            client_secret: 'pi_sub_secret_xxx',
          },
        },
      }),
    };

    subscriptionService = {
      create: jest.fn().mockResolvedValue({
        id: 'local-sub-1',
        stripeSubscriptionId: 'sub_stripe_new',
      }),
    };

    orderClient = {
      send: jest.fn(),
      emit: jest.fn(),
    };

    catalogClient = {
      send: jest.fn(),
    };

    authClient = {
      send: jest.fn(),
      emit: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentService,
        { provide: StripeService, useValue: stripeService },
        { provide: SubscriptionService, useValue: subscriptionService },
        { provide: SERVICE_NAMES.ORDER, useValue: orderClient },
        { provide: SERVICE_NAMES.CATALOG, useValue: catalogClient },
        { provide: SERVICE_NAMES.AUTH, useValue: authClient },
      ],
    }).compile();

    service = module.get<PaymentService>(PaymentService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('createPaymentIntent', () => {
    it('should create a payment intent with server-side calculated amount', async () => {
      // Cart returns 2x prod-1 ($49.99) + 1x prod-2 ($29.99) = 129.97
      orderClient.send.mockReturnValue(of(mockCart));
      catalogClient.send
        .mockReturnValueOnce(of(mockProducts[0]))
        .mockReturnValueOnce(of(mockProducts[1]));

      const result = await service.createPaymentIntent({
        cartId: 'cart-1',
        userId: 'user-1',
        billingAddress: { street: '1 Rue', city: 'Paris', postalCode: '75001', country: 'FR' },
      });

      expect(result.clientSecret).toBe('pi_test_123_secret_xxx');
      expect(result.paymentIntentId).toBe('pi_test_123');
      expect(result.currency).toBe('eur');

      // Verify server-side calculation: 49.99*2 + 29.99*1 = 129.97 -> 12997 cents
      expect(stripeService.createPaymentIntent).toHaveBeenCalledWith(
        12997,
        'eur',
        expect.objectContaining({ cartId: 'cart-1', userId: 'user-1' }),
      );
    });

    it('should throw when cart is empty', async () => {
      orderClient.send.mockReturnValue(of({ id: 'cart-1', items: [] }));

      await expect(
        service.createPaymentIntent({
          cartId: 'cart-1',
          billingAddress: {
            street: '1 Rue',
            city: 'Paris',
            postalCode: '75001',
            country: 'FR',
          },
        }),
      ).rejects.toThrow(RpcException);
    });

    it('should throw when cart is null', async () => {
      orderClient.send.mockReturnValue(of(null));

      await expect(
        service.createPaymentIntent({
          cartId: 'cart-1',
          billingAddress: {
            street: '1 Rue',
            city: 'Paris',
            postalCode: '75001',
            country: 'FR',
          },
        }),
      ).rejects.toThrow(RpcException);
    });

    it('should throw when product not found in product map lookup', async () => {
      // Cart has a product that catalog returns, but with a different ID,
      // so the Map lookup fails and throws PRODUCT_NOT_FOUND
      const cartWithBadRef = {
        id: 'cart-1',
        items: [{ productId: 'prod-missing', quantity: 1 }],
      };
      orderClient.send.mockReturnValue(of(cartWithBadRef));
      // Catalog returns a valid product but with different ID
      catalogClient.send.mockReturnValueOnce(of({ id: 'prod-other', price: '10.00' }));

      await expect(
        service.createPaymentIntent({
          cartId: 'cart-1',
          billingAddress: {
            street: '1 Rue',
            city: 'Paris',
            postalCode: '75001',
            country: 'FR',
          },
        }),
      ).rejects.toThrow(RpcException);
    });

    it('should never use frontend-provided amounts (security: server-side calculation)', async () => {
      const cartWithOneItem = {
        id: 'cart-1',
        items: [{ productId: 'prod-1', quantity: 1 }],
      };
      orderClient.send.mockReturnValue(of(cartWithOneItem));
      catalogClient.send.mockReturnValueOnce(of({ id: 'prod-1', price: '100.00' }));

      await service.createPaymentIntent({
        cartId: 'cart-1',
        billingAddress: {
          street: '1 Rue',
          city: 'Paris',
          postalCode: '75001',
          country: 'FR',
        },
      });

      // Verify amount is from product.price, not from any DTO field
      expect(stripeService.createPaymentIntent).toHaveBeenCalledWith(
        10000, // 100.00 * 100 cents
        'eur',
        expect.any(Object),
      );
    });

    it('should set empty string for userId and guestEmail in metadata when not provided', async () => {
      const cartWithOneItem = {
        id: 'cart-1',
        items: [{ productId: 'prod-1', quantity: 1 }],
      };
      orderClient.send.mockReturnValue(of(cartWithOneItem));
      catalogClient.send.mockReturnValueOnce(of({ id: 'prod-1', price: '10.00' }));

      await service.createPaymentIntent({
        cartId: 'cart-1',
        billingAddress: {
          street: '1 Rue',
          city: 'Paris',
          postalCode: '75001',
          country: 'FR',
        },
      });

      expect(stripeService.createPaymentIntent).toHaveBeenCalledWith(
        1000,
        'eur',
        expect.objectContaining({ userId: '', guestEmail: '' }),
      );
    });
  });

  describe('createSubscription', () => {
    it('should create subscription when user has stripeCustomerId', async () => {
      authClient.send.mockReturnValue(
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
        billingPeriod: 'monthly' as any,
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
      authClient.send.mockReturnValue(
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
        billingPeriod: 'monthly' as any,
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
      expect(authClient.emit).toHaveBeenCalledWith('auth.update_stripe_customer_id', {
        userId: 'user-1',
        stripeCustomerId: 'cus_new_123',
      });
    });

    it('should use yearly price for yearly billing period', async () => {
      authClient.send.mockReturnValue(
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
        billingPeriod: 'yearly' as any,
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
      authClient.send.mockReturnValue(
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
          billingPeriod: 'monthly' as any,
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
      authClient.send.mockReturnValue(
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
          billingPeriod: 'monthly' as any,
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
      authClient.send.mockReturnValue(
        of({
          id: 'user-1',
          email: 'user@test.com',
          stripeCustomerId: 'cus_existing',
        }),
      );
      catalogClient.send.mockReturnValue(of(mockProduct));
      (stripeService.createSubscription as jest.Mock).mockResolvedValueOnce({
        id: 'sub_stripe_new',
        latest_invoice: { payment_intent: null },
      });

      await expect(
        service.createSubscription({
          userId: 'user-1',
          productId: 'prod-1',
          billingPeriod: 'monthly' as any,
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
      authClient.send.mockReturnValue(
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
        billingPeriod: 'monthly' as any,
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
});
