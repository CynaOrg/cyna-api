import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { of, throwError } from 'rxjs';
import { WebhookService } from './webhook.service';
import { SubscriptionService } from './subscription.service';
import { LicenseService } from './license.service';
import { ProcessedWebhook } from '../entities/processed-webhook.entity';
import { SERVICE_NAMES, EVENT_PATTERNS, Language, SubscriptionStatus } from '@cyna-api/common';

describe('WebhookService', () => {
  let service: WebhookService;
  let processedWebhookRepository: Partial<Repository<ProcessedWebhook>>;
  let subscriptionService: Partial<SubscriptionService>;
  let licenseService: Partial<LicenseService>;
  let orderClient: { emit: jest.Mock; send: jest.Mock };
  let notificationClient: { emit: jest.Mock };

  const mockOrderSnapshot = {
    id: 'order-1',
    orderNumber: 'CYN-2026-00001',
    userId: 'user-1',
    notificationEmail: 'user@example.com',
    notificationLanguage: Language.EN,
    guestEmail: null,
    total: 100,
    currency: 'EUR',
    items: [{ productSnapshot: { name: 'SOC Pro' }, quantity: 1 }],
  };

  beforeEach(async () => {
    processedWebhookRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((entity) => entity),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
    };

    subscriptionService = {
      findByStripeId: jest.fn().mockResolvedValue(null),
      updateStatus: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({}),
      syncFromStripe: jest.fn().mockResolvedValue({}),
    };

    licenseService = {
      generateForOrder: jest.fn().mockResolvedValue([]),
      revokeByOrderId: jest.fn().mockResolvedValue(undefined),
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
    it('should skip already processed events (idempotence)', async () => {
      (processedWebhookRepository.findOne as jest.Mock).mockResolvedValueOnce({
        eventId: 'evt_duplicate',
      });

      await service.handleWebhookEvent({
        eventId: 'evt_duplicate',
        eventType: 'payment_intent.succeeded',
        data: {},
        created: Date.now(),
      });

      expect(orderClient.emit).not.toHaveBeenCalled();
      expect(notificationClient.emit).not.toHaveBeenCalled();
    });

    it('should mark event as processed after handling', async () => {
      await service.handleWebhookEvent({
        eventId: 'evt_new',
        eventType: 'payment_intent.succeeded',
        data: { id: 'pi_123', amount: 5000, metadata: {} },
        created: Date.now(),
      });

      expect(processedWebhookRepository.save).toHaveBeenCalled();
    });

    describe('payment_intent.succeeded', () => {
      it('emits legacy CONFIRMED to order and enriched PaymentConfirmedEvent to notification', async () => {
        const data = { id: 'pi_123', amount: 5000, metadata: { cartId: 'cart-1' } };

        await service.handleWebhookEvent({
          eventId: 'evt_1',
          eventType: 'payment_intent.succeeded',
          data,
          created: Date.now(),
        });

        expect(orderClient.emit).toHaveBeenCalledWith(EVENT_PATTERNS.PAYMENT.CONFIRMED, {
          paymentIntentId: 'pi_123',
          amount: 5000,
          metadata: { cartId: 'cart-1' },
        });
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

      it('skips notification when order cannot be resolved', async () => {
        orderClient.send.mockReturnValueOnce(of(null));

        await service.handleWebhookEvent({
          eventId: 'evt_1b',
          eventType: 'payment_intent.succeeded',
          data: { id: 'pi_orphan', amount: 5000, metadata: {} },
          created: Date.now(),
        });

        expect(orderClient.emit).toHaveBeenCalled();
        expect(notificationClient.emit).not.toHaveBeenCalled();
      });

      it('swallows order lookup errors without crashing the webhook', async () => {
        orderClient.send.mockReturnValueOnce(throwError(() => new Error('order service down')));

        await expect(
          service.handleWebhookEvent({
            eventId: 'evt_1c',
            eventType: 'payment_intent.succeeded',
            data: { id: 'pi_err', amount: 5000, metadata: {} },
            created: Date.now(),
          }),
        ).resolves.toBeUndefined();

        expect(notificationClient.emit).not.toHaveBeenCalled();
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
      it('marks as processed without errors', async () => {
        await service.handleWebhookEvent({
          eventId: 'evt_12',
          eventType: 'some.unknown.event',
          data: {},
          created: Date.now(),
        });

        expect(processedWebhookRepository.save).toHaveBeenCalled();
      });
    });
  });
});
