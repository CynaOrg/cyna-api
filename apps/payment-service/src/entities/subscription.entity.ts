import { Entity, Column, Index } from 'typeorm';
import { BaseEntity, BillingPeriod, Language, SubscriptionStatus } from '@cyna-api/common';

@Entity('subscriptions')
@Index('idx_subscriptions_user_id', ['userId'])
@Index('idx_subscriptions_product_id', ['productId'])
@Index('idx_subscriptions_stripe_subscription_id', ['stripeSubscriptionId'], { unique: true })
@Index('idx_subscriptions_status', ['status'])
export class Subscription extends BaseEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ name: 'product_id', type: 'uuid' })
  productId: string;

  @Column({ name: 'product_name', type: 'varchar', length: 255, nullable: true })
  productName: string | null;

  @Column({
    type: 'enum',
    enum: SubscriptionStatus,
    default: SubscriptionStatus.ACTIVE,
  })
  status: SubscriptionStatus;

  @Column({
    name: 'billing_period',
    type: 'enum',
    enum: BillingPeriod,
  })
  billingPeriod: BillingPeriod;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price: number;

  @Column({ type: 'varchar', length: 3, default: 'EUR' })
  currency: string;

  @Column({ name: 'stripe_subscription_id', type: 'varchar', length: 255, unique: true })
  stripeSubscriptionId: string;

  @Column({ name: 'stripe_customer_id', type: 'varchar', length: 255 })
  stripeCustomerId: string;

  @Column({ name: 'stripe_price_id', type: 'varchar', length: 255 })
  stripePriceId: string;

  @Column({ name: 'current_period_start', type: 'timestamptz', nullable: true })
  currentPeriodStart: Date;

  @Column({ name: 'current_period_end', type: 'timestamptz', nullable: true })
  currentPeriodEnd: Date;

  @Column({ name: 'cancel_at_period_end', type: 'boolean', default: false })
  cancelAtPeriodEnd: boolean;

  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt: Date | null;

  @Column({ name: 'ended_at', type: 'timestamptz', nullable: true })
  endedAt: Date | null;

  @Column({ name: 'notification_email', type: 'varchar', length: 255, nullable: true })
  notificationEmail: string | null;

  @Column({
    name: 'notification_language',
    type: 'enum',
    enum: Language,
    nullable: true,
  })
  notificationLanguage: Language | null;
}
