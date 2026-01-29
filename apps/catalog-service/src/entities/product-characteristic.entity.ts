import {
  Entity,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Product } from './product.entity';

@Entity('product_characteristics')
export class ProductCharacteristic {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'product_id', type: 'uuid' })
  @Index('idx_characteristic_product')
  productId: string;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: Product;

  @Column({ name: 'key_fr', type: 'varchar', length: 100 })
  keyFr: string;

  @Column({ name: 'key_en', type: 'varchar', length: 100 })
  keyEn: string;

  @Column({ name: 'value_fr', type: 'varchar', length: 255 })
  valueFr: string;

  @Column({ name: 'value_en', type: 'varchar', length: 255 })
  valueEn: string;

  @Column({ name: 'display_order', type: 'integer', default: 0 })
  displayOrder: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
