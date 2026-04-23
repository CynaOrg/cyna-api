import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { of, throwError, TimeoutError } from 'rxjs';
import { WebhookService } from './webhook.service';
import { SubscriptionService } from './subscription.service';
import { LicenseService } from './license.service';
import { StripeService } from './stripe.service';
import { ProcessedWebhook } from '../entities/processed-webhook.entity';
import {
  SERVICE_NAMES,
  EVENT_PATTERNS,
  MESSAGE_PATTERNS,
  Language,
  SubscriptionStatus,
} from '@cyna-api/common';

describe('WebhookService', () => {
  let service: WebhookService;
  let processedWebhookRepository: Partial<Repository<ProcessedWebhook>>;
  let subscriptionService: Partial<SubscriptionService>;
  let licenseService: Partial<LicenseService>;
  let stripeService: Partial<StripeService>;
  let orderClient: { emit: jest.Mock; send: jest.Mock };
  let notificationClient: { emit: jest.Mock };

  const mockOrderSnapshot = {
    id: 'order-1',
    orderNumber: 'CYN-2026-00001',
    userId: 'user-1',
    notificationEmail: 'user@example.com',
    notificationLanguage: Language.EN,
    customerEmail: 'user@example.com',
    total: 100,
    currency: 'EUR',
    items: [{ productSnapshot: { name: 'SOC Pro' }, quantity: 1 }],
  };

  beforeEach(async () => {
    processedWebhookRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((entity) => entity),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
      insert: jest.fn().mockResolvedValue({ identifiers: [{ eventId: 'stub' }] }),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    subscriptionService = {
      findByStripeId: jest.fn().mockResolvedValue(null),
      updateStatus: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({}),
      syncFromStripe: jest.fn().mockResolvedValue({}),
    };

    licenseService = {
      generateForOrder: jest.fn().mockResolvedValue([]),
      findByOrderId: jest.fn().mockResolvedValue([]),
      revokeByOrderId: jest.fn().mockResolvedValue(undefined),
    };

    stripeService = {
      // Default: PI has a customer attached so the webhook takes the "real
      // invoice" path. Individual tests can override to test the fallback.
      getPaymentIntentWithCharge: jest.fn().mockResolvedValue({
        id: 'pi_stub',
        customer: 'cus_stub',
        latest_charge: { id: 'ch_stub', receipt_url: 'https://stripe.test/receipt/ch_stub' },
      }),
      generateInvoiceForPurchase: jest.fn().mockResolvedValue({
        id: 'in_stub',
        number: 'F-2026-0001',
        hosted_invoice_url: 'https://invoice.stripe.test/i/in_stub',
        invoice_pdf: 'https://invoice.stripe.test/i/in_stub/pdf',
      }),
      getInvoice: jest.fn(),
    };

    orderClient = {
      emit: jest.fn(),
      send: jest.fn().mockReturnValue(of(mockOrderSnapshot)),
    };
    notificationClient = { emit: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookService,
        {
          provide: getRepositoryToken(ProcessedWebhook),
          useValue: processedWebhookRepository,
        },
        {
          provide: SubscriptionService,
          useValue: subscriptionService,
        },
        {
          provide: LicenseService,
          useValue: licenseService,
        },
        {
          provide: StripeService,
          useValue: stripeService,
        },
        {
          provide: SERVICE_NAMES.ORDER,
          useValue: orderClient,
        },
        {
          provide: SERVICE_NAMES.NOTIFICATION,
          useValue: notificationClient,
        },
      ],
    }).compile();

    service = module.get<WebhookService>(WebhookService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('isProcessed', () => {
    it('should return true if event already exists', async () => {
      (processedWebhookRepository.findOne as jest.Mock).mockResolvedValueOnce({
        eventId: 'evt_123',
      });

      const result = await service.isProcessed('evt_123');

      expect(result).toBe(true);
    });

    it('should return false if event does not exist', async () => {
      const result = await service.isProcessed('evt_new');

      expect(result).toBe(false);
    });
  });

  describe('markProcessed', () => {
    it('should save a processed webhook record', async () => {
      await service.markProcessed('evt_123', 'payment_intent.succeeded');

      expect(processedWebhookRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: 'evt_123',
          eventType: 'payment_intent.succeeded',
          processedAt: expect.any(Date),
        }),
      );
      expect(processedWebhookRepository.save).toHaveBeenCalled();
    });
  });

  describe('handleWebhookEvent', () => {
    it('should skip when claim insert fails with unique violation (concurrent delivery)', async () => {
      const pgUniqueViolation = Object.assign(new Error('duplicate key'), { code: '23505' });
      (processedWebhookRepository.insert as jest.Mock).mockRejectedValueOnce(pgUniqueViolation);

      await service.handleWebhookEvent({
        eventId: 'evt_duplicate',
        eventType: 'payment_intent.succeeded',
        data: {},
        created: Date.now(),
      });

      expect(orderClient.emit).not.toHaveBeenCalled();
      expect(notificationClient.emit).not.toHaveBeenCalled();
    });

    it('should claim the event via insert before dispatching to a handler', async () => {
      orderClient.send.mockReturnValueOnce(
        of({
          id: 'order-claim',
          userId: null,
          customerEmail: 'x@y.z',
          items: [],
        }),
      );
      // The orphan-items path would throw with our new behaviour, so use a
      // non-license path: no license items, handler returns cleanly.
      await service.handleWebhookEvent({
        eventId: 'evt_new',
        eventType: 'payment_intent.succeeded',
        data: { id: 'pi_123', amount: 5000, metadata: {} },
        created: Date.now(),
      });

      expect(processedWebhookRepository.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: 'evt_new',
          eventType: 'payment_intent.succeeded',
          processedAt: expect.any(Date),
        }),
      );
    });

    it('should release the claim when a handler throws so Stripe can retry', async () => {
      orderClient.send.mockReturnValueOnce(of(null));

      await expect(
        service.handleWebhookEvent({
          eventId: 'evt_release',
          eventType: 'payment_intent.succeeded',
          data: { id: 'pi_release', amount: 100, metadata: {} },
          created: Date.now(),
        }),
      ).rejects.toThrow('Order not found for payment intent');

      expect(processedWebhookRepository.delete).toHaveBeenCalledWith({ eventId: 'evt_release' });
    });

    describe('payment_intent.succeeded', () => {
      const licenseOrder = {
        id: 'order-1',
        orderNumber: 'CYN-2026-00001',
        userId: 'user-1',
        customerEmail: 'user@example.com',
        notificationEmail: 'user@example.com',
        notificationLanguage: Language.EN,
        total: 100,
        currency: 'EUR',
        items: [
          {
            productId: 'prod-1',
            quantity: 2,
            unitPrice: 50,
            productSnapshot: {
              productType: 'license',
              name: 'Antivirus',
              nameFr: 'Antivirus',
              nameEn: 'Antivirus EN',
              slug: 'antivirus',
            },
          },
        ],
      };

      it('emits legacy CONFIRMED to order and enriched PaymentConfirmedEvent to notification', async () => {
        const data = { id: 'pi_123', amount: 5000, metadata: { cartId: 'cart-1' } };

        await service.handleWebhookEvent({
          eventId: 'evt_1',
          eventType: 'payment_intent.succeeded',
          data,
          created: Date.now(),
        });

        expect(orderClient.emit).toHaveBeenCalledWith(
          EVENT_PATTERNS.PAYMENT.CONFIRMED,
          expect.objectContaining({
            paymentIntentId: 'pi_123',
            amount: 5000,
            metadata: { cartId: 'cart-1' },
            stripeInvoiceUrl: 'https://stripe.test/receipt/ch_stub',
          }),
        );
        expect(notificationClient.emit).toHaveBeenCalledWith(
          EVENT_PATTERNS.PAYMENT.CONFIRMED,
          expect.objectContaining({
            orderId: 'order-1',
            orderNumber: 'CYN-2026-00001',
            email: 'user@example.com',
            language: Language.EN,
            total: 100,
            itemsSummary: 'SOC Pro x1',
          }),
        );
      });

      it('should resolve the order via RPC using paymentIntentId', async () => {
        orderClient.send.mockReturnValueOnce(of(licenseOrder));

        await service.handleWebhookEvent({
          eventId: 'evt_rpc',
          eventType: 'payment_intent.succeeded',
          data: { id: 'pi_rpc', amount: 100, metadata: {} },
          created: Date.now(),
        });

        expect(orderClient.send).toHaveBeenCalledWith(
          MESSAGE_PATTERNS.ORDER.GET_ORDER_BY_PAYMENT_INTENT,
          { paymentIntentId: 'pi_rpc' },
        );
      });

      it('should generate licenses for a logged-in user order', async () => {
        orderClient.send.mockReturnValueOnce(of(licenseOrder));

        await service.handleWebhookEvent({
          eventId: 'evt_user_license',
          eventType: 'payment_intent.succeeded',
          data: { id: 'pi_user', amount: 100, metadata: {} },
          created: Date.now(),
        });

        expect(licenseService.generateForOrder).toHaveBeenCalledWith('order-1', [
          {
            productId: 'prod-1',
            productType: 'license',
            quantity: 2,
            email: 'user@example.com',
            userId: 'user-1',
            productSnapshot: {
              nameFr: 'Antivirus',
              nameEn: 'Antivirus EN',
              slug: 'antivirus',
            },
          },
        ]);
      });

      it('emits LICENSES_ISSUED with raw activation tokens when licenses are generated', async () => {
        orderClient.send.mockReturnValue(of(licenseOrder));
        const expiresAt = new Date('2026-05-23T00:00:00Z');
        (licenseService.generateForOrder as jest.Mock).mockResolvedValueOnce([
          {
            license: {
              id: 'lic-1',
              licenseKey: 'CYNA-AAAA-BBBB-CCCC-DDDD',
              productSnapshot: { nameFr: 'Antivirus', nameEn: 'Antivirus EN', slug: 'antivirus' },
              activationTokenExpiresAt: expiresAt,
            },
            activationToken: 'raw-token-xyz',
          },
        ]);

        await service.handleWebhookEvent({
          eventId: 'evt_issued',
          eventType: 'payment_intent.succeeded',
          data: { id: 'pi_issued', amount: 100, metadata: {} },
          created: Date.now(),
        });

        expect(notificationClient.emit).toHaveBeenCalledWith(
          EVENT_PATTERNS.PAYMENT.LICENSES_ISSUED,
          expect.objectContaining({
            orderId: 'order-1',
            orderNumber: 'CYN-2026-00001',
            userId: 'user-1',
            email: 'user@example.com',
            language: Language.EN,
            licenses: [
              expect.objectContaining({
                licenseId: 'lic-1',
                licenseKey: 'CYNA-AAAA-BBBB-CCCC-DDDD',
                activationToken: 'raw-token-xyz',
                activationExpiresAt: expiresAt.toISOString(),
              }),
            ],
          }),
        );
      });

      it('generates a real Stripe invoice and forwards its hosted URL', async () => {
        orderClient.send.mockReturnValue(of(licenseOrder));

        await service.handleWebhookEvent({
          eventId: 'evt_invoice',
          eventType: 'payment_intent.succeeded',
          data: { id: 'pi_invoice', amount: 100, metadata: {} },
          created: Date.now(),
        });

        expect(stripeService.getPaymentIntentWithCharge).toHaveBeenCalledWith('pi_invoice');
        expect(stripeService.generateInvoiceForPurchase).toHaveBeenCalledWith(
          expect.objectContaining({
            customerId: 'cus_stub',
            currency: 'EUR',
            items: [
              {
                description: 'Antivirus',
                unitPriceHt: 50,
                quantity: 2,
              },
            ],
            metadata: expect.objectContaining({
              orderId: 'order-1',
              orderNumber: 'CYN-2026-00001',
              paymentIntentId: 'pi_invoice',
            }),
          }),
        );
        expect(orderClient.emit).toHaveBeenCalledWith(
          EVENT_PATTERNS.PAYMENT.CONFIRMED,
          expect.objectContaining({
            paymentIntentId: 'pi_invoice',
            stripeInvoiceId: 'in_stub',
            stripeInvoiceUrl: 'https://invoice.stripe.test/i/in_stub',
          }),
        );
        expect(notificationClient.emit).toHaveBeenCalledWith(
          EVENT_PATTERNS.PAYMENT.CONFIRMED,
          expect.objectContaining({ invoiceUrl: 'https://invoice.stripe.test/i/in_stub' }),
        );
      });

      it('falls back to charge receipt URL when PaymentIntent has no customer attached', async () => {
        orderClient.send.mockReturnValue(of(licenseOrder));
        (stripeService.getPaymentIntentWithCharge as jest.Mock).mockResolvedValueOnce({
          id: 'pi_no_customer',
          customer: null,
          latest_charge: { id: 'ch_fb', receipt_url: 'https://stripe.test/receipt/ch_fb' },
        });

        await service.handleWebhookEvent({
          eventId: 'evt_fallback',
          eventType: 'payment_intent.succeeded',
          data: { id: 'pi_no_customer', amount: 100, metadata: {} },
          created: Date.now(),
        });

        expect(stripeService.generateInvoiceForPurchase).not.toHaveBeenCalled();
        expect(orderClient.emit).toHaveBeenCalledWith(
          EVENT_PATTERNS.PAYMENT.CONFIRMED,
          expect.objectContaining({
            stripeInvoiceId: 'ch_fb',
            stripeInvoiceUrl: 'https://stripe.test/receipt/ch_fb',
          }),
        );
      });

      it('falls back to null invoice fields when the charge receipt fetch fails', async () => {
        orderClient.send.mockReturnValue(of(licenseOrder));
        (stripeService.getPaymentIntentWithCharge as jest.Mock).mockRejectedValueOnce(
          new Error('stripe api down'),
        );

        await service.handleWebhookEvent({
          eventId: 'evt_receipt_err',
          eventType: 'payment_intent.succeeded',
          data: { id: 'pi_err', amount: 100, metadata: {} },
          created: Date.now(),
        });

        expect(orderClient.emit).toHaveBeenCalledWith(
          EVENT_PATTERNS.PAYMENT.CONFIRMED,
          expect.objectContaining({
            paymentIntentId: 'pi_err',
            stripeInvoiceId: null,
            stripeInvoiceUrl: null,
          }),
        );
      });

      it('does NOT emit LICENSES_ISSUED when no licenses are generated (physical-only order)', async () => {
        orderClient.send.mockReturnValue(of(licenseOrder));
        (licenseService.generateForOrder as jest.Mock).mockResolvedValueOnce([]);

        await service.handleWebhookEvent({
          eventId: 'evt_no_issue',
          eventType: 'payment_intent.succeeded',
          data: { id: 'pi_no_issue', amount: 100, metadata: {} },
          created: Date.now(),
        });

        const issuedCalls = notificationClient.emit.mock.calls.filter(
          (c) => c[0] === EVENT_PATTERNS.PAYMENT.LICENSES_ISSUED,
        );
        expect(issuedCalls).toHaveLength(0);
      });

      it('should generate licenses for a guest order (userId null)', async () => {
        orderClient.send.mockReturnValueOnce(
          of({ ...licenseOrder, userId: null, customerEmail: 'guest@example.com' }),
        );

        await service.handleWebhookEvent({
          eventId: 'evt_guest_license',
          eventType: 'payment_intent.succeeded',
          data: { id: 'pi_guest', amount: 100, metadata: {} },
          created: Date.now(),
        });

        expect(licenseService.generateForOrder).toHaveBeenCalledWith(
          'order-1',
          expect.arrayContaining([
            expect.objectContaining({
              email: 'guest@example.com',
              userId: undefined,
            }),
          ]),
        );
      });

      it('should filter non-license items before calling LicenseService', async () => {
        const mixedOrder = {
          ...licenseOrder,
          items: [
            licenseOrder.items[0],
            {
              productId: 'prod-physical',
              quantity: 1,
              productSnapshot: {
                productType: 'physical',
                nameFr: 'Boite',
                nameEn: 'Box',
                slug: 'box',
              },
            },
          ],
        };
        orderClient.send.mockReturnValueOnce(of(mixedOrder));

        await service.handleWebhookEvent({
          eventId: 'evt_mixed',
          eventType: 'payment_intent.succeeded',
          data: { id: 'pi_mixed', amount: 100, metadata: {} },
          created: Date.now(),
        });

        const call = (licenseService.generateForOrder as jest.Mock).mock.calls[0];
        expect(call[0]).toBe('order-1');
        expect(call[1]).toHaveLength(1);
        expect(call[1][0].productType).toBe('license');
        expect(call[1][0].productId).toBe('prod-1');
      });

      it('should skip license generation entirely for a physical-only order', async () => {
        const physicalOnly = {
          ...licenseOrder,
          items: [
            {
              productId: 'prod-physical',
              quantity: 1,
              productSnapshot: {
                productType: 'physical',
                nameFr: 'Boite',
                nameEn: 'Box',
                slug: 'box',
              },
            },
          ],
        };
        orderClient.send.mockReturnValueOnce(of(physicalOnly));

        await service.handleWebhookEvent({
          eventId: 'evt_physical',
          eventType: 'payment_intent.succeeded',
          data: { id: 'pi_physical', amount: 100, metadata: {} },
          created: Date.now(),
        });

        expect(licenseService.generateForOrder).not.toHaveBeenCalled();
        expect(licenseService.findByOrderId).not.toHaveBeenCalled();
        expect(orderClient.emit).toHaveBeenCalledWith(
          EVENT_PATTERNS.PAYMENT.CONFIRMED,
          expect.objectContaining({ paymentIntentId: 'pi_physical' }),
        );
      });

      it('should skip license generation when licenses already exist (idempotence)', async () => {
        orderClient.send.mockReturnValueOnce(of(licenseOrder));
        (licenseService.findByOrderId as jest.Mock).mockResolvedValueOnce([
          { id: 'existing-license' },
        ]);

        await service.handleWebhookEvent({
          eventId: 'evt_idempotent',
          eventType: 'payment_intent.succeeded',
          data: { id: 'pi_idempotent', amount: 100, metadata: {} },
          created: Date.now(),
        });

        expect(licenseService.generateForOrder).not.toHaveBeenCalled();
        expect(orderClient.emit).toHaveBeenCalledWith(
          EVENT_PATTERNS.PAYMENT.CONFIRMED,
          expect.objectContaining({ paymentIntentId: 'pi_idempotent' }),
        );
      });

      it('should throw when no order is found so Stripe retries the webhook', async () => {
        orderClient.send.mockReturnValueOnce(of(null));

        await expect(
          service.handleWebhookEvent({
            eventId: 'evt_orphan',
            eventType: 'payment_intent.succeeded',
            data: { id: 'pi_orphan', amount: 100, metadata: {} },
            created: Date.now(),
          }),
        ).rejects.toThrow('Order not found for payment intent pi_orphan');

        expect(licenseService.generateForOrder).not.toHaveBeenCalled();
        expect(orderClient.emit).not.toHaveBeenCalled();
        expect(notificationClient.emit).not.toHaveBeenCalled();
        // Claim must be released so the retry re-enters the handler.
        expect(processedWebhookRepository.delete).toHaveBeenCalledWith({ eventId: 'evt_orphan' });
      });

      it('should rethrow RPC timeout and release the claim so Stripe retries', async () => {
        orderClient.send.mockReturnValueOnce(throwError(() => new TimeoutError()));

        await expect(
          service.handleWebhookEvent({
            eventId: 'evt_timeout',
            eventType: 'payment_intent.succeeded',
            data: { id: 'pi_timeout', amount: 100, metadata: {} },
            created: Date.now(),
          }),
        ).rejects.toBeInstanceOf(TimeoutError);

        expect(licenseService.generateForOrder).not.toHaveBeenCalled();
        expect(orderClient.emit).not.toHaveBeenCalled();
        expect(processedWebhookRepository.delete).toHaveBeenCalledWith({ eventId: 'evt_timeout' });
      });

      it('should rethrow license service failure and release the claim so Stripe retries', async () => {
        orderClient.send.mockReturnValueOnce(of(licenseOrder));
        (licenseService.generateForOrder as jest.Mock).mockRejectedValueOnce(
          new Error('DB unique constraint violation'),
        );

        await expect(
          service.handleWebhookEvent({
            eventId: 'evt_license_fail',
            eventType: 'payment_intent.succeeded',
            data: { id: 'pi_license_fail', amount: 100, metadata: {} },
            created: Date.now(),
          }),
        ).rejects.toThrow('DB unique constraint violation');

        expect(orderClient.emit).not.toHaveBeenCalled();
        expect(processedWebhookRepository.delete).toHaveBeenCalledWith({
          eventId: 'evt_license_fail',
        });
      });
    });

    describe('payment_intent.payment_failed', () => {
      it('forwards raw Stripe message internally and curated bilingual message to customer', async () => {
        const data = {
          id: 'pi_456',
          last_payment_error: { message: 'Insufficient funds', decline_code: 'insufficient_funds' },
        };

        await service.handleWebhookEvent({
          eventId: 'evt_2',
          eventType: 'payment_intent.payment_failed',
          data,
          created: Date.now(),
        });

        // Internal consumers (order service) keep the raw Stripe message.
        expect(orderClient.emit).toHaveBeenCalledWith(EVENT_PATTERNS.PAYMENT.FAILED, {
          paymentIntentId: 'pi_456',
          error: 'Insufficient funds',
        });
        // Customer gets the curated English message (order snapshot language is EN).
        expect(notificationClient.emit).toHaveBeenCalledWith(
          EVENT_PATTERNS.PAYMENT.FAILED,
          expect.objectContaining({
            orderId: 'order-1',
            email: 'user@example.com',
            language: Language.EN,
            error: 'Your card has insufficient funds.',
          }),
        );
      });

      it('falls back to generic bilingual message when decline_code is unknown', async () => {
        const data = {
          id: 'pi_456b',
          last_payment_error: { message: 'some_obscure_issuer_text' },
        };

        await service.handleWebhookEvent({
          eventId: 'evt_2b',
          eventType: 'payment_intent.payment_failed',
          data,
          created: Date.now(),
        });

        expect(notificationClient.emit).toHaveBeenCalledWith(
          EVENT_PATTERNS.PAYMENT.FAILED,
          expect.objectContaining({
            error: expect.stringMatching(/Your payment was declined/),
          }),
        );
      });

      it('uses default message when last_payment_error is absent', async () => {
        const data = { id: 'pi_789' };

        await service.handleWebhookEvent({
          eventId: 'evt_3',
          eventType: 'payment_intent.payment_failed',
          data,
          created: Date.now(),
        });

        expect(orderClient.emit).toHaveBeenCalledWith(EVENT_PATTERNS.PAYMENT.FAILED, {
          paymentIntentId: 'pi_789',
          error: 'Payment failed',
        });
      });
    });

    describe('invoice.paid', () => {
      it('updates subscription period and emits enriched SubscriptionRenewedEvent', async () => {
        const mockSub = {
          id: 'local-sub-1',
          userId: 'user-1',
          productId: 'prod-1',
          productName: 'SOC Pro',
          notificationEmail: 'user@example.com',
          notificationLanguage: Language.EN,
          currentPeriodEnd: null,
        };
        (subscriptionService.findByStripeId as jest.Mock).mockResolvedValueOnce(mockSub);

        const data = {
          subscription: 'sub_stripe_1',
          lines: { data: [{ period: { end: 1700000000 } }] },
        };

        await service.handleWebhookEvent({
          eventId: 'evt_4',
          eventType: 'invoice.paid',
          data,
          created: Date.now(),
        });

        expect(subscriptionService.create).toHaveBeenCalledWith(
          expect.objectContaining({
            currentPeriodEnd: new Date(1700000000 * 1000),
          }),
        );
        expect(notificationClient.emit).toHaveBeenCalledWith(
          EVENT_PATTERNS.PAYMENT.SUBSCRIPTION_RENEWED,
          expect.objectContaining({
            subscriptionId: 'local-sub-1',
            userId: 'user-1',
            email: 'user@example.com',
            language: Language.EN,
            productName: 'SOC Pro',
          }),
        );
      });

      it('skips when no subscription ID in data', async () => {
        const data = { subscription: null };

        await service.handleWebhookEvent({
          eventId: 'evt_5',
          eventType: 'invoice.paid',
          data,
          created: Date.now(),
        });

        expect(subscriptionService.findByStripeId).not.toHaveBeenCalled();
      });

      it('skips notification when notificationEmail missing on subscription', async () => {
        const mockSub = {
          id: 'local-sub-legacy',
          userId: 'user-legacy',
          notificationEmail: null,
        };
        (subscriptionService.findByStripeId as jest.Mock).mockResolvedValueOnce(mockSub);

        await service.handleWebhookEvent({
          eventId: 'evt_4b',
          eventType: 'invoice.paid',
          data: { subscription: 'sub_stripe_legacy', lines: { data: [] } },
          created: Date.now(),
        });

        expect(notificationClient.emit).not.toHaveBeenCalled();
      });

      it('persists hosted_invoice_url on the subscription and forwards it in the event', async () => {
        const mockSub = {
          id: 'local-sub-2',
          userId: 'user-2',
          productName: 'XDR',
          notificationEmail: 'u2@example.com',
          notificationLanguage: Language.FR,
          currentPeriodEnd: null,
          stripeLatestInvoiceUrl: null as string | null,
        };
        (subscriptionService.findByStripeId as jest.Mock).mockResolvedValueOnce(mockSub);

        await service.handleWebhookEvent({
          eventId: 'evt_invoice_url',
          eventType: 'invoice.paid',
          data: {
            subscription: 'sub_stripe_2',
            lines: { data: [{ period: { end: 1700000000 } }] },
            hosted_invoice_url: 'https://stripe.test/invoice/xyz',
          },
          created: Date.now(),
        });

        expect(subscriptionService.create).toHaveBeenCalledWith(
          expect.objectContaining({
            stripeLatestInvoiceUrl: 'https://stripe.test/invoice/xyz',
          }),
        );
        expect(notificationClient.emit).toHaveBeenCalledWith(
          EVENT_PATTERNS.PAYMENT.SUBSCRIPTION_RENEWED,
          expect.objectContaining({
            invoiceUrl: 'https://stripe.test/invoice/xyz',
          }),
        );
      });
    });

    describe('invoice.payment_failed', () => {
      it('updates to PAST_DUE and emits enriched SubscriptionPastDueEvent', async () => {
        const mockSub = {
          id: 'local-sub-2',
          userId: 'user-2',
          productName: 'SOC Pro',
          notificationEmail: 'user@example.com',
          notificationLanguage: Language.FR,
        };
        (subscriptionService.findByStripeId as jest.Mock).mockResolvedValueOnce(mockSub);

        const data = { subscription: 'sub_stripe_2' };

        await service.handleWebhookEvent({
          eventId: 'evt_6',
          eventType: 'invoice.payment_failed',
          data,
          created: Date.now(),
        });

        expect(subscriptionService.updateStatus).toHaveBeenCalledWith(
          'sub_stripe_2',
          SubscriptionStatus.PAST_DUE,
        );
        expect(notificationClient.emit).toHaveBeenCalledWith(
          EVENT_PATTERNS.PAYMENT.SUBSCRIPTION_PAST_DUE,
          expect.objectContaining({
            subscriptionId: 'local-sub-2',
            email: 'user@example.com',
            language: Language.FR,
            productName: 'SOC Pro',
          }),
        );
      });
    });

    describe('customer.subscription.created', () => {
      it('emits enriched SubscriptionCreatedEvent when snapshot is available', async () => {
        const mockSub = {
          id: 'local-sub-new',
          userId: 'user-new',
          productName: 'SOC Pro',
          notificationEmail: 'user@example.com',
          notificationLanguage: Language.FR,
        };
        (subscriptionService.findByStripeId as jest.Mock).mockResolvedValueOnce(mockSub);

        const data = {
          id: 'sub_stripe_new',
          customer: 'cus_123',
          items: {
            data: [
              {
                price: {
                  unit_amount: 4900,
                  currency: 'eur',
                  recurring: { interval: 'month' },
                },
              },
            ],
          },
        };

        await service.handleWebhookEvent({
          eventId: 'evt_7',
          eventType: 'customer.subscription.created',
          data,
          created: Date.now(),
        });

        expect(notificationClient.emit).toHaveBeenCalledWith(
          EVENT_PATTERNS.PAYMENT.SUBSCRIPTION_CREATED,
          expect.objectContaining({
            subscriptionId: 'local-sub-new',
            userId: 'user-new',
            email: 'user@example.com',
            language: Language.FR,
            billingPeriod: 'monthly',
            price: 49,
            currency: 'EUR',
          }),
        );
      });

      it('skips emit when local subscription cannot be found (Stripe race)', async () => {
        (subscriptionService.findByStripeId as jest.Mock).mockResolvedValueOnce(null);

        await service.handleWebhookEvent({
          eventId: 'evt_7b',
          eventType: 'customer.subscription.created',
          data: { id: 'sub_unknown', customer: 'cus_123', items: { data: [] } },
          created: Date.now(),
        });

        expect(notificationClient.emit).not.toHaveBeenCalled();
      });
    });

    describe('customer.subscription.updated', () => {
      it('syncs subscription from Stripe', async () => {
        const data = { id: 'sub_stripe_updated', status: 'active' };

        await service.handleWebhookEvent({
          eventId: 'evt_8',
          eventType: 'customer.subscription.updated',
          data,
          created: Date.now(),
        });

        expect(subscriptionService.syncFromStripe).toHaveBeenCalledWith(data);
      });

      it('does not throw if syncFromStripe fails', async () => {
        (subscriptionService.syncFromStripe as jest.Mock).mockRejectedValueOnce(
          new Error('Not found'),
        );
        const data = { id: 'sub_unknown', status: 'active' };

        await expect(
          service.handleWebhookEvent({
            eventId: 'evt_9',
            eventType: 'customer.subscription.updated',
            data,
            created: Date.now(),
          }),
        ).resolves.toBeUndefined();
      });
    });

    describe('customer.subscription.deleted', () => {
      it('sets to CANCELLED and emits enriched SubscriptionCancelledEvent', async () => {
        const mockSub = {
          id: 'local-sub-3',
          userId: 'user-3',
          productId: 'prod-3',
          productName: 'SOC Pro',
          status: SubscriptionStatus.ACTIVE,
          notificationEmail: 'user@example.com',
          notificationLanguage: Language.EN,
        };
        (subscriptionService.findByStripeId as jest.Mock).mockResolvedValueOnce(mockSub);

        const data = { id: 'sub_stripe_deleted' };

        await service.handleWebhookEvent({
          eventId: 'evt_10',
          eventType: 'customer.subscription.deleted',
          data,
          created: Date.now(),
        });

        expect(subscriptionService.create).toHaveBeenCalledWith(
          expect.objectContaining({
            status: SubscriptionStatus.CANCELLED,
            endedAt: expect.any(Date),
          }),
        );
        expect(notificationClient.emit).toHaveBeenCalledWith(
          EVENT_PATTERNS.PAYMENT.SUBSCRIPTION_CANCELLED,
          expect.objectContaining({
            subscriptionId: 'local-sub-3',
            email: 'user@example.com',
            language: Language.EN,
            productName: 'SOC Pro',
          }),
        );
      });
    });

    describe('charge.refunded', () => {
      it('emits REFUNDED to order and enriched RefundedEvent to notification', async () => {
        const data = {
          id: 'ch_123',
          payment_intent: 'pi_refund',
          amount_refunded: 5000,
          currency: 'eur',
        };

        await service.handleWebhookEvent({
          eventId: 'evt_11',
          eventType: 'charge.refunded',
          data,
          created: Date.now(),
        });

        expect(orderClient.emit).toHaveBeenCalledWith(EVENT_PATTERNS.PAYMENT.REFUNDED, {
          paymentIntentId: 'pi_refund',
          chargeId: 'ch_123',
          amount: 5000,
        });
        expect(notificationClient.emit).toHaveBeenCalledWith(
          EVENT_PATTERNS.PAYMENT.REFUNDED,
          expect.objectContaining({
            orderId: 'order-1',
            email: 'user@example.com',
            refundAmount: 50,
            currency: 'EUR',
          }),
        );
      });
    });

    describe('unhandled event type', () => {
      it('marks as processed without errors (no-op handler)', async () => {
        await service.handleWebhookEvent({
          eventId: 'evt_12',
          eventType: 'some.unknown.event',
          data: {},
          created: Date.now(),
        });

        expect(processedWebhookRepository.insert).toHaveBeenCalled();
        expect(processedWebhookRepository.delete).not.toHaveBeenCalled();
      });
    });
  });
});
