import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrderStatus } from '@cyna-api/common';
import { Order } from '../entities/order.entity';

const PENDING_TTL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class PendingOrdersCleanupCron {
  private readonly logger = new Logger(PendingOrdersCleanupCron.name);

  constructor(@InjectRepository(Order) private readonly orderRepository: Repository<Order>) {}

  // PENDING is a staging state created when the customer clicks "continue to
  // payment". If they abandon the flow before submitting a card, Stripe never
  // fires a webhook and the row sits in PENDING indefinitely — accumulating in
  // the DB and skewing admin queries. 24h is well past any reasonable card-
  // entry session for the card flow we currently support. We CANCEL rather
  // than DELETE so the row stays auditable.
  //
  // SEPA / bank-transfer caveat: enabling non-card payment methods on Stripe
  // can leave a legitimate PaymentIntent in `processing` for 1-4 business
  // days. We don't currently handle `payment_intent.processing` (see
  // payment-service/webhook.service.ts), so `updated_at` would not get
  // bumped during that wait and this cron would wrongly cancel. Before
  // turning on SEPA/virement, either bump this TTL or wire up a `processing`
  // handler that pushes the order out of PENDING.
  //
  // We use a set-based UPDATE so the status transition is atomic at the DB:
  // a Stripe webhook flipping the same row to PAID in the same window cannot
  // be silently overwritten by a stale in-memory entity (which a
  // find-then-save loop would do). The WHERE clause also makes the cron
  // naturally idempotent.
  @Cron(CronExpression.EVERY_HOUR)
  async handle(): Promise<void> {
    const threshold = new Date(Date.now() - PENDING_TTL_MS);
    const result = await this.orderRepository
      .createQueryBuilder()
      .update(Order)
      .set({ status: OrderStatus.CANCELLED })
      .where('status = :pending', { pending: OrderStatus.PENDING })
      .andWhere('updated_at < :threshold', { threshold })
      .execute();

    const affected = result.affected ?? 0;
    if (affected > 0) {
      this.logger.log(`Cancelled ${affected} abandoned pending order(s)`);
    }
  }
}
