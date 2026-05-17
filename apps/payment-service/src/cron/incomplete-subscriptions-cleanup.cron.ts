import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SubscriptionStatus } from '@cyna-api/common';
import { Subscription } from '../entities/subscription.entity';

const INCOMPLETE_TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class IncompleteSubscriptionsCleanupCron {
  private readonly logger = new Logger(IncompleteSubscriptionsCleanupCron.name);

  constructor(
    @InjectRepository(Subscription)
    private readonly subscriptionRepository: Repository<Subscription>,
  ) {}

  // INCOMPLETE is a staging state created when the customer clicks "subscribe"
  // and we hand back a Stripe `clientSecret` for the initial invoice. If the
  // customer abandons the payment flow, Stripe expires the subscription on
  // its side after ~23h and emits `customer.subscription.deleted`. We could
  // rely solely on that webhook, but missed webhooks happen (network blip,
  // Stripe outage, signature mismatch during a rotation) and we don't want a
  // phantom row sitting around indefinitely. This cron is the safety net.
  //
  // Hard DELETE (not soft / not flip to CANCELLED): an unpaid subscription is
  // not a cancelled subscription. The customer never owned it, the admin has
  // nothing to do with it, analytics must not count it. Stripe stays the
  // source of truth for the Stripe-side `incomplete_expired` history.
  //
  // Set-based DELETE keeps the operation atomic: a webhook flipping the row
  // to ACTIVE in the same window cannot be silently overwritten — the WHERE
  // status='incomplete' guard makes it idempotent and race-safe.
  @Cron(CronExpression.EVERY_HOUR)
  async handle(): Promise<void> {
    const threshold = new Date(Date.now() - INCOMPLETE_TTL_MS);
    const result = await this.subscriptionRepository
      .createQueryBuilder()
      .delete()
      .from(Subscription)
      .where('status = :incomplete', { incomplete: SubscriptionStatus.INCOMPLETE })
      .andWhere('updated_at < :threshold', { threshold })
      .execute();

    const affected = result.affected ?? 0;
    if (affected > 0) {
      this.logger.log(`Hard-deleted ${affected} abandoned incomplete subscription(s)`);
    }
  }
}
