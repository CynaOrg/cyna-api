import {
  Entity,
  Column,
  Index,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { BaseEntity, ProductType } from '@cyna-api/common';
import { Category } from './category.entity';
import { ProductImage } from './product-image.entity';
import { ProductCharacteristic } from './product-characteristic.entity';

@Entity('products')
export class Product extends BaseEntity {
  @Column({ name: 'category_id', type: 'uuid' })
  @Index('idx_product_category')
  categoryId: string;

  @ManyToOne(() => Category, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'category_id' })
  category: Category;

  @Column({ type: 'varchar', length: 150, unique: true })
  @Index('idx_product_slug')
  slug: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  @Index('idx_product_sku')
  sku: string;

  @Column({ name: 'name_fr', type: 'varchar', length: 200 })
  nameFr: string;

  @Column({ name: 'name_en', type: 'varchar', length: 200 })
  nameEn: string;

  @Column({ name: 'description_fr', type: 'text' })
  descriptionFr: string;

  @Column({ name: 'description_en', type: 'text' })
  descriptionEn: string;

  @Column({ name: 'short_description_fr', type: 'varchar', length: 300, nullable: true })
  shortDescriptionFr?: string;

  @Column({ name: 'short_description_en', type: 'varchar', length: 300, nullable: true })
  shortDescriptionEn?: string;

  @Column({
    name: 'product_type',
    type: 'enum',
    enum: ProductType,
  })
  @Index('idx_product_type')
  productType: ProductType;

  // SaaS pricing (monthly/yearly subscription)
  @Column({ name: 'price_monthly', type: 'decimal', precision: 10, scale: 2, nullable: true })
  priceMonthly?: number;

  @Column({ name: 'price_yearly', type: 'decimal', precision: 10, scale: 2, nullable: true })
  priceYearly?: number;

  // Unit pricing (digital/physical one-time purchase)
  @Column({ name: 'price_unit', type: 'decimal', precision: 10, scale: 2, nullable: true })
  priceUnit?: number;

  // Stock management (physical products only)
  @Column({ name: 'stock_quantity', type: 'integer', nullable: true })
  stockQuantity?: number;

  @Column({ name: 'stock_alert_threshold', type: 'integer', default: 10 })
  stockAlertThreshold: number;

  @Column({ name: 'is_available', type: 'boolean', default: true })
  isAvailable: boolean;

  @Column({ name: 'is_featured', type: 'boolean', default: false })
  @Index('idx_product_featured', { where: '"is_featured" = true' })
  isFeatured: boolean;

  @Column({ name: 'display_order', type: 'integer', default: 0 })
  displayOrder: number;

  // Stripe integration
  @Column({ name: 'stripe_product_id', type: 'varchar', length: 255, nullable: true })
  stripeProductId?: string;

  @Column({ name: 'stripe_price_id_monthly', type: 'varchar', length: 255, nullable: true })
  stripePriceIdMonthly?: string;

  @Column({ name: 'stripe_price_id_yearly', type: 'varchar', length: 255, nullable: true })
  stripePriceIdYearly?: string;

  @Column({ name: 'stripe_price_id_unit', type: 'varchar', length: 255, nullable: true })
  stripePriceIdUnit?: string;

  // Relations
  @OneToMany(() => ProductImage, (image) => image.product, { cascade: true })
  images: ProductImage[];

  @OneToMany(() => ProductCharacteristic, (char) => char.product, { cascade: true })
  characteristics: ProductCharacteristic[];

  // Relations to be added in Phase 4
  // @OneToMany(() => StockReservation, (reservation) => reservation.product)
  // stockReservations: StockReservation[];
}
