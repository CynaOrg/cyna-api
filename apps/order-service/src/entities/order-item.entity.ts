import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity, BillingPeriod } from '@cyna-api/common';
import { Order } from './order.entity';

@Entity('order_items')
@Index('idx_order_items_order_id', ['orderId'])
@Index('idx_order_items_product_id', ['productId'])
export class OrderItem extends BaseEntity {
  @Column({ name: 'order_id', type: 'uuid' })
  orderId: string;

  @ManyToOne(() => Order, (order) => order.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order: Order;

  @Column({ name: 'product_id', type: 'uuid' })
  productId: string;

  @Column({ name: 'product_snapshot', type: 'jsonb' })
  productSnapshot: Record<string, unknown>;

  @Column({ type: 'integer', default: 1 })
  quantity: number;

  @Column({ name: 'unit_price', type: 'decimal', precision: 10, scale: 2 })
  unitPrice: number;

  @Column({ name: 'total_price', type: 'decimal', precision: 10, scale: 2 })
  totalPrice: number;

  @Column({
    name: 'billing_period',
    type: 'enum',
    enum: BillingPeriod,
  })
  billingPeriod: BillingPeriod;
}
