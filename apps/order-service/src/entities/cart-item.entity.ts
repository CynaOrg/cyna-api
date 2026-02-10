import { Entity, Column, ManyToOne, JoinColumn, Index, Unique } from 'typeorm';
import { BaseEntity, BillingPeriod } from '@cyna-api/common';
import { Cart } from './cart.entity';

@Entity('cart_items')
@Unique('UQ_cart_product_billing', ['cart', 'productId', 'billingPeriod'])
export class CartItem extends BaseEntity {
  @ManyToOne(() => Cart, (cart) => cart.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cart_id' })
  cart: Cart;

  @Column({ name: 'cart_id', type: 'uuid' })
  cartId: string;

  @Column({ name: 'product_id', type: 'uuid' })
  @Index()
  productId: string;

  @Column({ type: 'integer', default: 1 })
  quantity: number;

  @Column({
    name: 'billing_period',
    type: 'enum',
    enum: BillingPeriod,
    default: BillingPeriod.ONE_TIME,
  })
  billingPeriod: BillingPeriod;
}
