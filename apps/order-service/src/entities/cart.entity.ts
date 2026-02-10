import { Entity, Column, OneToMany, Index, Check } from 'typeorm';
import { BaseEntity } from '@cyna-api/common';
import { CartItem } from './cart-item.entity';

@Entity('carts')
@Check(`"user_id" IS NOT NULL OR "session_id" IS NOT NULL`)
@Index('idx_carts_session_id', ['sessionId'], { unique: true, where: '"session_id" IS NOT NULL' })
@Index('idx_carts_user_id', ['userId'], { unique: true, where: '"user_id" IS NOT NULL' })
@Index('idx_carts_expires_at', ['expiresAt'])
export class Cart extends BaseEntity {
  @Column({ name: 'user_id', type: 'varchar', nullable: true })
  userId: string | null;

  @Column({ name: 'session_id', type: 'varchar', nullable: true })
  sessionId: string | null;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @OneToMany(() => CartItem, (item) => item.cart, { cascade: true, eager: true })
  items: CartItem[];
}
