/**
 * Extra coverage for SubscriptionService: focuses on the branches that the
 * baseline `subscription.service.spec.ts` skips:
 *   - update()
 *   - findAll() and findAllAdmin() (admin pagination + soft-deletion semantics)
 *   - adminUpdateTerms() (happy + Stripe failure + status map)
 *   - cancelAllForCustomer() (account-deletion fan-out)
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RpcException } from '@nestjs/microservices';
import { FindOperator, Repository } from 'typeorm';
import Stripe from 'stripe';

import { SubscriptionService } from './subscription.service';
import { StripeService } from './stripe.service';
import { Subscription } from '../entities/subscription.entity';
import { SubscriptionStatus, BillingPeriod } from '@cyna-api/common';

describe('SubscriptionService (extra coverage)', () => {
  let service: SubscriptionService;
  let repo: Partial<Repository<Subscription>>;
  let stripeService: Partial<StripeService>;

  const baseSub: Partial<Subscription> = {
    id: 'sub-local-1',
    userId: 'user-1',
    productId: 'prod-1',
    status: SubscriptionStatus.ACTIVE,
    billingPeriod: BillingPeriod.MONTHLY,
    price: 49.99,
    currency: 'EUR',
    stripeSubscriptionId: 'sub_stripe_1',
    stripeCustomerId: 'cus_1',
    stripePriceId: 'price_1',
    cancelAtPeriodEnd: false,
  };

  beforeEach(async () => {
    repo = {
      create: jest.fn().mockImplementation((entity) => entity),
      save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
    };

    stripeService = {
      updateSubscription: jest.fn(),
      cancelSubscription: jest.fn().mockResolvedValue({ id: 'sub_stripe_1' }),
      listActiveSubscriptions: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubscriptionService,
        { provide: getRepositoryToken(Subscription), useValue: repo },
        { provide: StripeService, useValue: stripeService },
      ],
    }).compile();

    service = module.get<SubscriptionService>(SubscriptionService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('update', () => {
    it('forwards partial fields to repository.update', async () => {
      await service.update('sub-local-1', { status: SubscriptionStatus.PAUSED });
      expect(repo.update).toHaveBeenCalledWith('sub-local-1', {
        status: SubscriptionStatus.PAUSED,
      });
    });
  });

  describe('findAll', () => {
    it('returns all subscriptions ordered DESC', async () => {
      (repo.find as jest.Mock).mockResolvedValueOnce([baseSub]);
      const result = await service.findAll();
      expect(result).toEqual([baseSub]);
      expect(repo.find).toHaveBeenCalledWith({ order: { createdAt: 'DESC' } });
    });
  });

  describe('findAllAdmin', () => {
    it('uses page=1/limit=20 defaults when query is empty and excludes INCOMPLETE by default', async () => {
      // INCOMPLETE rows are abandoned payment attempts — they must not pollute
      // the admin listing. The filter is bypassed only when the caller asks
      // for `status=incomplete` explicitly (see the dedicated test below).
      (repo.findAndCount as jest.Mock).mockResolvedValueOnce([[baseSub], 1]);
      const result = await service.findAllAdmin({});
      expect(result).toEqual({ items: [baseSub], total: 1, page: 1, limit: 20 });
      const call = (repo.findAndCount as jest.Mock).mock.calls[0][0];
      expect(call.where.status).toBeInstanceOf(FindOperator);
      expect((call.where.status as FindOperator<unknown>).type).toBe('not');
      expect((call.where.status as FindOperator<unknown>).value).toBe(
        SubscriptionStatus.INCOMPLETE,
      );
      expect(call.order).toEqual({ createdAt: 'DESC' });
      expect(call.skip).toBe(0);
      expect(call.take).toBe(20);
    });

    it('clamps page to >= 1 even when the caller sends 0/-1', async () => {
      await service.findAllAdmin({ page: -3, limit: 5 });
      expect(repo.findAndCount).toHaveBeenCalledWith(expect.objectContaining({ skip: 0, take: 5 }));
    });

    it('clamps limit to <= 100 to prevent DoS-via-large-pagination', async () => {
      await service.findAllAdmin({ page: 2, limit: 5000 });
      expect(repo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 100, take: 100 }),
      );
    });

    it('applies the status filter when provided', async () => {
      await service.findAllAdmin({ status: SubscriptionStatus.CANCELLED });
      expect(repo.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ where: { status: SubscriptionStatus.CANCELLED } }),
      );
    });
  });

  describe('adminUpdateTerms', () => {
    it('throws SUBSCRIPTION_NOT_FOUND when local sub does not exist', async () => {
      (repo.findOne as jest.Mock).mockResolvedValueOnce(null);
      await expect(service.adminUpdateTerms('missing', {})).rejects.toThrow(RpcException);
    });

    it('passes cancel_at_period_end and trial_end to Stripe and syncs local state', async () => {
      (repo.findOne as jest.Mock).mockResolvedValueOnce({ ...baseSub });
      (stripeService.updateSubscription as jest.Mock).mockResolvedValueOnce({
        id: 'sub_stripe_1',
        status: 'active',
        cancel_at_period_end: true,
        current_period_end: 1800000000,
      });

      const result = await service.adminUpdateTerms('sub-local-1', {
        cancelAtPeriodEnd: true,
        trialEnd: 'now',
      });

      expect(stripeService.updateSubscription).toHaveBeenCalledWith('sub_stripe_1', {
        cancel_at_period_end: true,
        trial_end: 'now',
      });
      expect(result.cancelAtPeriodEnd).toBe(true);
      expect(result.currentPeriodEnd).toBeInstanceOf(Date);
    });

    it('maps Stripe canceled status to local CANCELLED', async () => {
      (repo.findOne as jest.Mock).mockResolvedValueOnce({ ...baseSub });
      (stripeService.updateSubscription as jest.Mock).mockResolvedValueOnce({
        id: 'sub_stripe_1',
        status: 'canceled',
        cancel_at_period_end: false,
      });
      const result = await service.adminUpdateTerms('sub-local-1', { cancelAtPeriodEnd: false });
      expect(result.status).toBe(SubscriptionStatus.CANCELLED);
    });

    it('falls back to original status when Stripe returns an unknown status string', async () => {
      const sub = { ...baseSub, status: SubscriptionStatus.ACTIVE };
      (repo.findOne as jest.Mock).mockResolvedValueOnce(sub);
      (stripeService.updateSubscription as jest.Mock).mockResolvedValueOnce({
        id: 'sub_stripe_1',
        status: 'martian_status',
        cancel_at_period_end: false,
      });
      const result = await service.adminUpdateTerms('sub-local-1', {});
      expect(result.status).toBe(SubscriptionStatus.ACTIVE);
    });

    it('wraps Stripe failures in STRIPE_UPDATE_FAILED (502) RpcException', async () => {
      (repo.findOne as jest.Mock).mockResolvedValueOnce({ ...baseSub });
      (stripeService.updateSubscription as jest.Mock).mockRejectedValueOnce(new Error('boom'));

      try {
        await service.adminUpdateTerms('sub-local-1', { cancelAtPeriodEnd: true });
        fail('expected RpcException');
      } catch (err) {
        expect(err).toBeInstanceOf(RpcException);
        const rpcError = (err as RpcException).getError() as Record<string, unknown>;
        expect(rpcError.code).toBe('STRIPE_UPDATE_FAILED');
        expect(rpcError.statusCode).toBe(502);
        expect(rpcError.message).toBe('boom');
      }
    });

    it('uses generic message when Stripe throws a non-Error', async () => {
      (repo.findOne as jest.Mock).mockResolvedValueOnce({ ...baseSub });
      (stripeService.updateSubscription as jest.Mock).mockRejectedValueOnce('opaque');

      try {
        await service.adminUpdateTerms('sub-local-1', {});
        fail('expected RpcException');
      } catch (err) {
        const rpcError = (err as RpcException).getError() as Record<string, unknown>;
        expect(rpcError.message).toBe('Stripe update failed');
      }
    });
  });

  describe('cancelAllForCustomer', () => {
    it('returns 0 when customer has no active subscriptions', async () => {
      (stripeService.listActiveSubscriptions as jest.Mock).mockResolvedValueOnce([]);
      const count = await service.cancelAllForCustomer('cus_empty');
      expect(count).toBe(0);
    });

    it('cancels each Stripe subscription immediately and updates local record', async () => {
      (stripeService.listActiveSubscriptions as jest.Mock).mockResolvedValueOnce([
        { id: 'sub_a' },
        { id: 'sub_b' },
      ]);
      (repo.findOne as jest.Mock)
        .mockResolvedValueOnce({ ...baseSub, stripeSubscriptionId: 'sub_a' })
        .mockResolvedValueOnce({ ...baseSub, stripeSubscriptionId: 'sub_b' });

      const count = await service.cancelAllForCustomer('cus_1');

      expect(count).toBe(2);
      expect(stripeService.cancelSubscription).toHaveBeenNthCalledWith(1, 'sub_a', false);
      expect(stripeService.cancelSubscription).toHaveBeenNthCalledWith(2, 'sub_b', false);
      expect(repo.save).toHaveBeenCalledTimes(2);
    });

    it('continues to next subscription when one cancel fails (does not throw)', async () => {
      (stripeService.listActiveSubscriptions as jest.Mock).mockResolvedValueOnce([
        { id: 'sub_a' },
        { id: 'sub_b' },
      ]);
      (stripeService.cancelSubscription as jest.Mock)
        .mockRejectedValueOnce(new Error('Stripe error'))
        .mockResolvedValueOnce({ id: 'sub_b' });
      (repo.findOne as jest.Mock).mockResolvedValueOnce({
        ...baseSub,
        stripeSubscriptionId: 'sub_b',
      });

      const count = await service.cancelAllForCustomer('cus_1');

      expect(count).toBe(1);
    });

    it('does not call repo.save when local record is missing for a Stripe sub', async () => {
      (stripeService.listActiveSubscriptions as jest.Mock).mockResolvedValueOnce([{ id: 'sub_a' }]);
      (repo.findOne as jest.Mock).mockResolvedValueOnce(null);

      const count = await service.cancelAllForCustomer('cus_1');

      expect(count).toBe(1);
      expect(repo.save).not.toHaveBeenCalled();
    });
  });

  describe('syncFromStripe — branch coverage gaps', () => {
    it('falls back to original status when Stripe status is unknown', async () => {
      (repo.findOne as jest.Mock).mockResolvedValueOnce({
        ...baseSub,
        status: SubscriptionStatus.ACTIVE,
      });

      const result = await service.syncFromStripe({
        id: 'sub_stripe_1',
        status: 'weird_status',
        cancel_at_period_end: false,
        canceled_at: null,
        ended_at: null,
      } as unknown as Stripe.Subscription);

      expect(result.status).toBe(SubscriptionStatus.ACTIVE);
    });

    it('maps Stripe unpaid status to local UNPAID', async () => {
      (repo.findOne as jest.Mock).mockResolvedValueOnce({ ...baseSub });
      const result = await service.syncFromStripe({
        id: 'sub_stripe_1',
        status: 'unpaid',
        cancel_at_period_end: false,
      } as unknown as Stripe.Subscription);
      expect(result.status).toBe(SubscriptionStatus.UNPAID);
    });

    it('maps Stripe paused status to local PAUSED', async () => {
      (repo.findOne as jest.Mock).mockResolvedValueOnce({ ...baseSub });
      const result = await service.syncFromStripe({
        id: 'sub_stripe_1',
        status: 'paused',
        cancel_at_period_end: false,
      } as unknown as Stripe.Subscription);
      expect(result.status).toBe(SubscriptionStatus.PAUSED);
    });
  });
});
