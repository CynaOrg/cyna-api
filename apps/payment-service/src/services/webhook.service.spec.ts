import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { WebhookService } from './webhook.service';
import { SubscriptionService } from './subscription.service';
import { LicenseService } from './license.service';
import { ProcessedWebhook } from '../entities/processed-webhook.entity';
import { SERVICE_NAMES, EVENT_PATTERNS, SubscriptionStatus } from '@cyna-api/common';

describe('WebhookService', () => {
  let service: WebhookService;
  let processedWebhookRepository: Partial<Repository<ProcessedWebhook>>;
  let subscriptionService: Partial<SubscriptionService>;
  let licenseService: Partial<LicenseService>;
  let orderClient: { emit: jest.Mock };
  let notificationClient: { emit: jest.Mock };

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

    orderClient = { emit: jest.fn() };
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
      it('should emit CONFIRMED events to order and notification clients', async () => {
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
        expect(notificationClient.emit).toHaveBeenCalledWith(EVENT_PATTERNS.PAYMENT.CONFIRMED, {
          paymentIntentId: 'pi_123',
          amount: 5000,
          metadata: { cartId: 'cart-1' },
        });
      });
    });

    describe('payment_intent.payment_failed', () => {
      it('should emit FAILED event to order client', async () => {
        const data = {
          id: 'pi_456',
          last_payment_error: { message: 'Insufficient funds' },
        };

        await service.handleWebhookEvent({
          eventId: 'evt_2',
          eventType: 'payment_intent.payment_failed',
          data,
          created: Date.now(),
        });

        expect(orderClient.emit).toHaveBeenCalledWith(EVENT_PATTERNS.PAYMENT.FAILED, {
          paymentIntentId: 'pi_456',
          error: 'Insufficient funds',
        });
      });

      it('should use default message when last_payment_error is absent', async () => {
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
      it('should update subscription period and emit renewal event', async () => {
        const mockSub = {
          id: 'local-sub-1',
          userId: 'user-1',
          productId: 'prod-1',
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
          }),
        );
      });

      it('should skip when no subscription ID in data', async () => {
        const data = { subscription: null };

        await service.handleWebhookEvent({
          eventId: 'evt_5',
          eventType: 'invoice.paid',
          data,
          created: Date.now(),
        });

        expect(subscriptionService.findByStripeId).not.toHaveBeenCalled();
      });
    });

    describe('invoice.payment_failed', () => {
      it('should update subscription to PAST_DUE and emit event', async () => {
        const mockSub = {
          id: 'local-sub-2',
          userId: 'user-2',
          productId: 'prod-2',
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
          }),
        );
      });
    });

    describe('customer.subscription.created', () => {
      it('should emit SUBSCRIPTION_CREATED event', async () => {
        const data = { id: 'sub_stripe_new', customer: 'cus_123' };

        await service.handleWebhookEvent({
          eventId: 'evt_7',
          eventType: 'customer.subscription.created',
          data,
          created: Date.now(),
        });

        expect(notificationClient.emit).toHaveBeenCalledWith(
          EVENT_PATTERNS.PAYMENT.SUBSCRIPTION_CREATED,
          {
            stripeSubscriptionId: 'sub_stripe_new',
            customerId: 'cus_123',
          },
        );
      });
    });

    describe('customer.subscription.updated', () => {
      it('should sync subscription from Stripe', async () => {
        const data = { id: 'sub_stripe_updated', status: 'active' };

        await service.handleWebhookEvent({
          eventId: 'evt_8',
          eventType: 'customer.subscription.updated',
          data,
          created: Date.now(),
        });

        expect(subscriptionService.syncFromStripe).toHaveBeenCalledWith(data);
      });

      it('should not throw if syncFromStripe fails', async () => {
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
      it('should set subscription to CANCELLED and emit event', async () => {
        const mockSub = {
          id: 'local-sub-3',
          userId: 'user-3',
          productId: 'prod-3',
          status: SubscriptionStatus.ACTIVE,
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
          }),
        );
      });
    });

    describe('charge.refunded', () => {
      it('should emit REFUNDED event to order client', async () => {
        const data = {
          id: 'ch_123',
          payment_intent: 'pi_refund',
          amount_refunded: 5000,
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
      });
    });

    describe('unhandled event type', () => {
      it('should mark as processed without errors', async () => {
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
