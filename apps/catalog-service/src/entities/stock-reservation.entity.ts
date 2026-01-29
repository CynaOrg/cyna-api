import {
  Entity,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Product } from './product.entity';

@Entity('stock_reservations')
export class StockReservation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'product_id', type: 'uuid' })
  @Index('idx_reservation_product')
  productId: string;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column({ name: 'cart_id', type: 'uuid' })
  @Index('idx_reservation_cart')
  cartId: string;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  @Index('idx_reservation_user')
  userId?: string;

  @Column({ type: 'integer' })
  quantity: number;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  @Index('idx_reservation_expires')
  expiresAt: Date;

  @Column({ name: 'confirmed_at', type: 'timestamptz', nullable: true })
  confirmedAt?: Date;

  @Column({ name: 'released_at', type: 'timestamptz', nullable: true })
  releasedAt?: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  /**
   * Check if reservation is still active (not expired, not confirmed, not released)
   */
  isActive(): boolean {
    return (
      !this.confirmedAt &&
      !this.releasedAt &&
      new Date() < this.expiresAt
    );
  }

  /**
   * Check if reservation is expired
   */
  isExpired(): boolean {
    return (
      !this.confirmedAt &&
      !this.releasedAt &&
      new Date() >= this.expiresAt
    );
  }
}
