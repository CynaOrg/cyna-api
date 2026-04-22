import { Entity, Column, OneToMany, Index } from 'typeorm';
import { BaseEntity, Language, OrderStatus, OrderType } from '@cyna-api/common';
import { OrderItem } from './order-item.entity';

@Entity('orders')
@Index('idx_orders_user_id', ['userId'])
@Index('idx_orders_order_number', ['orderNumber'], { unique: true })
@Index('idx_orders_stripe_payment_intent_id', ['stripePaymentIntentId'])
@Index('idx_orders_status', ['status'])
export class Order extends BaseEntity {
  @Column({ name: 'order_number', type: 'varchar', length: 20, unique: true })
  orderNumber: string;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  @Column({ name: 'customer_email', type: 'varchar', length: 255 })
  customerEmail: string;

  @Column({ name: 'notification_email', type: 'varchar', length: 255, nullable: true })
  notificationEmail: string | null;

  @Column({
    name: 'notification_language',
    type: 'enum',
    enum: Language,
    nullable: true,
  })
  notificationLanguage: Language | null;

  @Column({
    type: 'enum',
    enum: OrderStatus,
    default: OrderStatus.PENDING,
  })
  status: OrderStatus;

  @Column({
    name: 'order_type',
    type: 'enum',
    enum: OrderType,
  })
  orderType: OrderType;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  subtotal: number;

  @Column({ name: 'tax_amount', type: 'decimal', precision: 10, scale: 2 })
  taxAmount: number;

  @Column({ name: 'shipping_amount', type: 'decimal', precision: 10, scale: 2, default: 0 })
  shippingAmount: number;

  @Column({ name: 'discount_amount', type: 'decimal', precision: 10, scale: 2, default: 0 })
  discountAmount: number;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  total: number;

  @Column({ type: 'varchar', length: 3, default: 'EUR' })
  currency: string;

  @Column({ name: 'billing_address_snapshot', type: 'jsonb' })
  billingAddressSnapshot: Record<string, unknown>;

  @Column({ name: 'shipping_address_snapshot', type: 'jsonb', nullable: true })
  shippingAddressSnapshot: Record<string, unknown> | null;

  @Column({ name: 'stripe_payment_intent_id', type: 'varchar', length: 255, nullable: true })
  stripePaymentIntentId: string | null;

  @Column({ name: 'paid_at', type: 'timestamptz', nullable: true })
  paidAt: Date | null;

  @Column({ name: 'shipped_at', type: 'timestamptz', nullable: true })
  shippedAt: Date | null;

  @Column({ name: 'delivered_at', type: 'timestamptz', nullable: true })
  deliveredAt: Date | null;

  @Column({ name: 'tracking_number', type: 'varchar', length: 255, nullable: true })
  trackingNumber: string | null;

  @Column({ name: 'tracking_url', type: 'varchar', length: 500, nullable: true })
  trackingUrl: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @OneToMany(() => OrderItem, (item) => item.order, { cascade: true, eager: true })
  items: OrderItem[];
}
