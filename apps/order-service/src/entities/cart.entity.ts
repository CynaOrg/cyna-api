import { Entity, Column, OneToMany, Index } from 'typeorm';
import { BaseEntity } from '@cyna-api/common';
import { CartItem } from './cart-item.entity';

@Entity('carts')
export class Cart extends BaseEntity {
  @Column({ name: 'user_id', type: 'varchar' })
  @Index({ unique: true })
  userId: string;

  @OneToMany(() => CartItem, (item) => item.cart, { cascade: true, eager: true })
  items: CartItem[];
}
