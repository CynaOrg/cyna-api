import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RpcException } from '@nestjs/microservices';
import { Repository } from 'typeorm';
import { SubscriptionService } from './subscription.service';
import { StripeService } from './stripe.service';
import { Subscription } from '../entities/subscription.entity';
import { SubscriptionStatus, BillingPeriod } from '@cyna-api/common';
import Stripe from 'stripe';

describe('SubscriptionService', () => {
  let service: SubscriptionService;
  let subscriptionRepository: Partial<Repository<Subscription>>;
  let stripeService: Partial<StripeService>;

  const mockSubscription: Partial<Subscription> = {
    id: 'sub-123',
    userId: 'user-123',
    productId: 'prod-123',
    status: SubscriptionStatus.ACTIVE,
    billingPeriod: BillingPeriod.MONTHLY,
    price: 29.99,
    currency: 'EUR',
    stripeSubscriptionId: 'sub_stripe_123',
    stripeCustomerId: 'cus_stripe_123',
    stripePriceId: 'price_stripe_123',
    currentPeriodStart: new Date('2026-01-01'),
    currentPeriodEnd: new Date('2026-02-01'),
    cancelAtPeriodEnd: false,
    cancelledAt: null,
    endedAt: null,
    createdAt: new Date(),
  };

  beforeEach(async () => {
    subscriptionRepository = {
      create: jest.fn().mockImplementation((entity) => ({ id: 'sub-123', ...entity })),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
    };

    stripeService = {
      cancelSubscription: jest.fn().mockResolvedValue({ id: 'sub_stripe_123' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionService,
        {
          provide: getRepositoryToken(Subscription),
          useValue: subscriptionRepository,
        },
        {
          provide: StripeService,
          useValue: stripeService,
        },
      ],
    }).compile();

    service = module.get<SubscriptionService>(SubscriptionService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create and save a subscription', async () => {
      const data: Partial<Subscription> = {
        userId: 'user-123',
        productId: 'prod-123',
        status: SubscriptionStatus.ACTIVE,
        billingPeriod: BillingPeriod.MONTHLY,
        price: 29.99,
        stripeSubscriptionId: 'sub_stripe_123',
        stripeCustomerId: 'cus_stripe_123',
        stripePriceId: 'price_stripe_123',
      };

      await service.create(data);

      expect(subscriptionRepository.create).toHaveBeenCalledWith(data);
      expect(subscriptionRepository.save).toHaveBeenCalled();
    });
  });

  describe('findByUserId', () => {
    it('should return subscriptions ordered by createdAt DESC', async () => {
      (subscriptionRepository.find as jest.Mock).mockResolvedValueOnce([mockSubscription]);

      const result = await service.findByUserId('user-123');

      expect(result).toEqual([mockSubscription]);
      expect(subscriptionRepository.find).toHaveBeenCalledWith({
        where: { userId: 'user-123' },
        order: { createdAt: 'DESC' },
      });
    });
  });

  describe('findById', () => {
    it('should return subscription when found', async () => {
      (subscriptionRepository.findOne as jest.Mock).mockResolvedValueOnce(mockSubscription);

      const result = await service.findById('sub-123');

      expect(result).toEqual(mockSubscription);
      expect(subscriptionRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'sub-123' },
      });
    });

    it('should return null when not found', async () => {
      const result = await service.findById('sub-nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('findByStripeId', () => {
    it('should find by stripeSubscriptionId', async () => {
      (subscriptionRepository.findOne as jest.Mock).mockResolvedValueOnce(mockSubscription);

      const result = await service.findByStripeId('sub_stripe_123');

      expect(result).toEqual(mockSubscription);
      expect(subscriptionRepository.findOne).toHaveBeenCalledWith({
        where: { stripeSubscriptionId: 'sub_stripe_123' },
      });
    });
  });

  describe('updateStatus', () => {
    it('should update status when subscription exists', async () => {
      (subscriptionRepository.findOne as jest.Mock).mockResolvedValueOnce({ ...mockSubscription });

      const result = await service.updateStatus('sub_stripe_123', SubscriptionStatus.PAST_DUE);

      expect(result.status).toBe(SubscriptionStatus.PAST_DUE);
      expect(subscriptionRepository.save).toHaveBeenCalled();
    });

    it('should throw RpcException when subscription not found', async () => {
      (subscriptionRepository.findOne as jest.Mock).mockResolvedValueOnce(null);

      await expect(
        service.updateStatus('sub_nonexistent', SubscriptionStatus.PAST_DUE),
      ).rejects.toThrow(RpcException);
    });
  });

  describe('cancel', () => {
    it('should cancel at period end when cancelAtPeriodEnd is true', async () => {
      (subscriptionRepository.findOne as jest.Mock).mockResolvedValueOnce({ ...mockSubscription });

      const result = await service.cancel('sub-123', 'user', 'user-123', true);

      expect(stripeService.cancelSubscription).toHaveBeenCalledWith('sub_stripe_123', true);
      expect(result.cancelAtPeriodEnd).toBe(true);
      expect(result.cancelledAt).toBeInstanceOf(Date);
      expect(result.status).toBe(SubscriptionStatus.ACTIVE);
    });

    it('should cancel immediately when cancelAtPeriodEnd is false', async () => {
      (subscriptionRepository.findOne as jest.Mock).mockResolvedValueOnce({ ...mockSubscription });

      const result = await service.cancel('sub-123', 'user', 'user-123', false);

      expect(stripeService.cancelSubscription).toHaveBeenCalledWith('sub_stripe_123', false);
      expect(result.status).toBe(SubscriptionStatus.CANCELLED);
      expect(result.cancelledAt).toBeInstanceOf(Date);
      expect(result.endedAt).toBeInstanceOf(Date);
    });

    it('should throw RpcException when subscription not found', async () => {
      (subscriptionRepository.findOne as jest.Mock).mockResolvedValueOnce(null);

      await expect(service.cancel('sub-nonexistent', 'user', 'user-123', true)).rejects.toThrow(
        RpcException,
      );
    });

    it('should throw RpcException when userId does not match (forbidden)', async () => {
      (subscriptionRepository.findOne as jest.Mock).mockResolvedValueOnce({ ...mockSubscription });

      await expect(service.cancel('sub-123', 'user', 'other-user', true)).rejects.toThrow(
        RpcException,
      );
    });

    it('should verify the error code is SUBSCRIPTION_FORBIDDEN for wrong user', async () => {
      (subscriptionRepository.findOne as jest.Mock).mockResolvedValueOnce({ ...mockSubscription });

      try {
        await service.cancel('sub-123', 'user', 'other-user', true);
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(RpcException);
        const rpcError = (error as RpcException).getError() as Record<string, unknown>;
        expect(rpcError.code).toBe('SUBSCRIPTION_FORBIDDEN');
        expect(rpcError.statusCode).toBe(403);
      }
    });

    it('should bypass ownership check when actor is admin', async () => {
      (subscriptionRepository.findOne as jest.Mock).mockResolvedValueOnce({ ...mockSubscription });

      const result = await service.cancel('sub-123', 'admin', undefined, false);

      expect(stripeService.cancelSubscription).toHaveBeenCalledWith('sub_stripe_123', false);
      expect(result.status).toBe(SubscriptionStatus.CANCELLED);
    });

    it('should reject user-initiated cancel without userId', async () => {
      (subscriptionRepository.findOne as jest.Mock).mockResolvedValueOnce({ ...mockSubscription });

      try {
        await service.cancel('sub-123', 'user', undefined, true);
        fail('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(RpcException);
        const rpcError = (error as RpcException).getError() as Record<string, unknown>;
        expect(rpcError.code).toBe('SUBSCRIPTION_USER_ID_REQUIRED');
      }
    });
  });

  describe('syncFromStripe', () => {
    const mockStripeSubscription = {
      id: 'sub_stripe_123',
      status: 'active' as const,
      cancel_at_period_end: false,
      canceled_at: null,
      ended_at: null,
      current_period_start: Math.floor(Date.now() / 1000),
      current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 3600,
    } as unknown as Stripe.Subscription;

    it('should sync subscription status from Stripe', async () => {
      (subscriptionRepository.findOne as jest.Mock).mockResolvedValueOnce({ ...mockSubscription });

      const result = await service.syncFromStripe(mockStripeSubscription);

      expect(result.status).toBe(SubscriptionStatus.ACTIVE);
      expect(result.cancelAtPeriodEnd).toBe(false);
      expect(subscriptionRepository.save).toHaveBeenCalled();
    });

    it('should map Stripe canceled status to local CANCELLED', async () => {
      (subscriptionRepository.findOne as jest.Mock).mockResolvedValueOnce({ ...mockSubscription });
      const canceledSub = {
        ...mockStripeSubscription,
        status: 'canceled',
        canceled_at: Math.floor(Date.now() / 1000),
      };

      const result = await service.syncFromStripe(canceledSub as unknown as Stripe.Subscription);

      expect(result.status).toBe(SubscriptionStatus.CANCELLED);
      expect(result.cancelledAt).toBeInstanceOf(Date);
    });

    it('should map Stripe past_due status to local PAST_DUE', async () => {
      (subscriptionRepository.findOne as jest.Mock).mockResolvedValueOnce({ ...mockSubscription });
      const pastDueSub = { ...mockStripeSubscription, status: 'past_due' };

      const result = await service.syncFromStripe(pastDueSub as unknown as Stripe.Subscription);

      expect(result.status).toBe(SubscriptionStatus.PAST_DUE);
    });

    it('should update period dates from Stripe data', async () => {
      (subscriptionRepository.findOne as jest.Mock).mockResolvedValueOnce({ ...mockSubscription });

      const result = await service.syncFromStripe(mockStripeSubscription);

      expect(result.currentPeriodStart).toBeInstanceOf(Date);
      expect(result.currentPeriodEnd).toBeInstanceOf(Date);
    });

    it('should set endedAt when Stripe has ended_at', async () => {
      (subscriptionRepository.findOne as jest.Mock).mockResolvedValueOnce({ ...mockSubscription });
      const endedSub = {
        ...mockStripeSubscription,
        status: 'canceled',
        ended_at: Math.floor(Date.now() / 1000),
      };

      const result = await service.syncFromStripe(endedSub as unknown as Stripe.Subscription);

      expect(result.endedAt).toBeInstanceOf(Date);
    });

    it('should throw RpcException when subscription not found locally', async () => {
      (subscriptionRepository.findOne as jest.Mock).mockResolvedValueOnce(null);

      await expect(service.syncFromStripe(mockStripeSubscription)).rejects.toThrow(RpcException);
    });
  });
});
