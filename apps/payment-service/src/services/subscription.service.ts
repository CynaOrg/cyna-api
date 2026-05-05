import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RpcException } from '@nestjs/microservices';
import { SubscriptionStatus } from '@cyna-api/common';
import { Subscription } from '../entities/subscription.entity';
import { StripeService } from './stripe.service';
import Stripe from 'stripe';

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);

  constructor(
    @InjectRepository(Subscription)
    private readonly subscriptionRepository: Repository<Subscription>,
    private readonly stripeService: StripeService,
  ) {}

  async create(data: Partial<Subscription>): Promise<Subscription> {
    const subscription = this.subscriptionRepository.create(data);
    return this.subscriptionRepository.save(subscription);
  }

  async update(id: string, data: Partial<Subscription>): Promise<void> {
    await this.subscriptionRepository.update(id, data);
  }

  async findByUserId(userId: string): Promise<Subscription[]> {
    return this.subscriptionRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async findAll(): Promise<Subscription[]> {
    return this.subscriptionRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Admin-facing paginated listing with optional filters.
   * SUB-2: filters/pagination must be honored end-to-end (cf. audit DTO-6).
   */
  async findAllAdmin(query: {
    status?: SubscriptionStatus;
    page?: number;
    limit?: number;
  }): Promise<{ items: Subscription[]; total: number; page: number; limit: number }> {
    const page = Math.max(query.page ?? 1, 1);
    const limit = Math.min(Math.max(query.limit ?? 20, 1), 100);
    const offset = (page - 1) * limit;

    // BaseEntity carries a @DeleteDateColumn — repository.findAndCount honors it
    // automatically (soft-deleted rows are excluded). Switching from QueryBuilder
    // to findAndCount avoids leaking soft-deleted subscriptions in the admin list.
    const where = query.status !== undefined ? { status: query.status } : {};
    const [items, total] = await this.subscriptionRepository.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: offset,
      take: limit,
    });

    return { items, total, page, limit };
  }

  async findById(id: string): Promise<Subscription | null> {
    return this.subscriptionRepository.findOne({ where: { id } });
  }

  async findByStripeId(stripeSubscriptionId: string): Promise<Subscription | null> {
    return this.subscriptionRepository.findOne({
      where: { stripeSubscriptionId },
    });
  }

  async updateStatus(
    stripeSubscriptionId: string,
    status: SubscriptionStatus,
  ): Promise<Subscription> {
    const subscription = await this.findByStripeId(stripeSubscriptionId);
    if (!subscription) {
      throw new RpcException({
        statusCode: 404,
        message: `Subscription with Stripe ID ${stripeSubscriptionId} not found`,
        code: 'SUBSCRIPTION_NOT_FOUND',
      });
    }
    subscription.status = status;
    return this.subscriptionRepository.save(subscription);
  }

  async cancel(
    subscriptionId: string,
    actor: 'user' | 'admin',
    userId: string | undefined,
    cancelAtPeriodEnd: boolean,
  ): Promise<Subscription> {
    const subscription = await this.findById(subscriptionId);
    if (!subscription) {
      throw new RpcException({
        statusCode: 404,
        message: 'Subscription not found',
        code: 'SUBSCRIPTION_NOT_FOUND',
      });
    }

    if (actor === 'user') {
      if (!userId) {
        throw new RpcException({
          statusCode: 400,
          message: 'userId is required for user-initiated cancellations',
          code: 'SUBSCRIPTION_USER_ID_REQUIRED',
        });
      }
      if (subscription.userId !== userId) {
        throw new RpcException({
          statusCode: 403,
          message: 'Not authorized to cancel this subscription',
          code: 'SUBSCRIPTION_FORBIDDEN',
        });
      }
    }
    // actor === 'admin': SuperAdminGuard already enforced at gateway boundary,
    // ownership check is intentionally skipped here.

    // Cancel on Stripe
    await this.stripeService.cancelSubscription(
      subscription.stripeSubscriptionId,
      cancelAtPeriodEnd,
    );

    // Update local state
    if (cancelAtPeriodEnd) {
      subscription.cancelAtPeriodEnd = true;
      subscription.cancelledAt = new Date();
    } else {
      subscription.status = SubscriptionStatus.CANCELLED;
      subscription.cancelledAt = new Date();
      subscription.endedAt = new Date();
    }

    return this.subscriptionRepository.save(subscription);
  }

  async syncFromStripe(stripeSubscription: Stripe.Subscription): Promise<Subscription> {
    const subscription = await this.findByStripeId(stripeSubscription.id);
    if (!subscription) {
      this.logger.warn(`Subscription ${stripeSubscription.id} not found locally during sync`);
      throw new RpcException({
        statusCode: 404,
        message: `Subscription ${stripeSubscription.id} not found locally`,
        code: 'SUBSCRIPTION_NOT_FOUND',
      });
    }

    // Map Stripe status to local status
    const statusMap: Record<string, SubscriptionStatus> = {
      active: SubscriptionStatus.ACTIVE,
      past_due: SubscriptionStatus.PAST_DUE,
      canceled: SubscriptionStatus.CANCELLED,
      unpaid: SubscriptionStatus.UNPAID,
      paused: SubscriptionStatus.PAUSED,
    };

    subscription.status = statusMap[stripeSubscription.status] || subscription.status;
    // current_period_start/end removed from Stripe SDK v20 types but still in API response
    const sub = stripeSubscription as unknown as Record<string, number>;
    if (sub.current_period_start) {
      subscription.currentPeriodStart = new Date(sub.current_period_start * 1000);
    }
    if (sub.current_period_end) {
      subscription.currentPeriodEnd = new Date(sub.current_period_end * 1000);
    }
    subscription.cancelAtPeriodEnd = stripeSubscription.cancel_at_period_end;

    if (stripeSubscription.canceled_at) {
      subscription.cancelledAt = new Date(stripeSubscription.canceled_at * 1000);
    }
    if (stripeSubscription.ended_at) {
      subscription.endedAt = new Date(stripeSubscription.ended_at * 1000);
    }

    return this.subscriptionRepository.save(subscription);
  }

  /**
   * Admin: update subscription terms (cancel_at_period_end, trial_end).
   * Applies the changes on Stripe first, then syncs the relevant fields locally.
   */
  async adminUpdateTerms(
    subscriptionId: string,
    params: { cancelAtPeriodEnd?: boolean; trialEnd?: 'now' | number },
  ): Promise<Subscription> {
    const subscription = await this.findById(subscriptionId);
    if (!subscription) {
      throw new RpcException({
        statusCode: 404,
        message: 'Subscription not found',
        code: 'SUBSCRIPTION_NOT_FOUND',
      });
    }

    const stripeParams: Stripe.SubscriptionUpdateParams = {};
    if (params.cancelAtPeriodEnd !== undefined) {
      stripeParams.cancel_at_period_end = params.cancelAtPeriodEnd;
    }
    if (params.trialEnd !== undefined) {
      stripeParams.trial_end = params.trialEnd;
    }

    let stripeSub: Stripe.Subscription;
    try {
      stripeSub = await this.stripeService.updateSubscription(
        subscription.stripeSubscriptionId,
        stripeParams,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Stripe update failed';
      this.logger.error(
        `Failed to update subscription terms on Stripe: ${message}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new RpcException({
        statusCode: 502,
        message,
        code: 'STRIPE_UPDATE_FAILED',
      });
    }

    // Sync relevant fields locally
    const statusMap: Record<string, SubscriptionStatus> = {
      active: SubscriptionStatus.ACTIVE,
      past_due: SubscriptionStatus.PAST_DUE,
      canceled: SubscriptionStatus.CANCELLED,
      unpaid: SubscriptionStatus.UNPAID,
      paused: SubscriptionStatus.PAUSED,
    };
    subscription.status = statusMap[stripeSub.status] || subscription.status;
    subscription.cancelAtPeriodEnd = stripeSub.cancel_at_period_end;

    const rawSub = stripeSub as unknown as Record<string, number | null | undefined>;
    if (typeof rawSub.current_period_end === 'number') {
      subscription.currentPeriodEnd = new Date(rawSub.current_period_end * 1000);
    }

    return this.subscriptionRepository.save(subscription);
  }

  /**
   * Cancel all active subscriptions for a Stripe customer (used when account is deleted)
   */
  async cancelAllForCustomer(stripeCustomerId: string): Promise<number> {
    // Get all active subscriptions from Stripe for this customer
    const stripeSubscriptions = await this.stripeService.listActiveSubscriptions(stripeCustomerId);

    let cancelledCount = 0;
    for (const stripeSub of stripeSubscriptions) {
      try {
        // Cancel immediately on Stripe (not at period end)
        await this.stripeService.cancelSubscription(stripeSub.id, false);

        // Update local record if exists
        const localSub = await this.findByStripeId(stripeSub.id);
        if (localSub) {
          localSub.status = SubscriptionStatus.CANCELLED;
          localSub.cancelledAt = new Date();
          localSub.endedAt = new Date();
          await this.subscriptionRepository.save(localSub);
        }

        cancelledCount++;
        this.logger.log(`Cancelled subscription ${stripeSub.id} for customer ${stripeCustomerId}`);
      } catch (error) {
        this.logger.error(
          `Failed to cancel subscription ${stripeSub.id}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }

    return cancelledCount;
  }
}
