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

@Entity('product_images')
@Index('idx_product_image_product', ['productId'])
@Index('idx_product_image_storage_key', ['storageKey'])
export class ProductImage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'product_id', type: 'uuid' })
  productId: string;

  @Column({ name: 'image_url', type: 'varchar', length: 500 })
  imageUrl: string;

  @Column({ name: 'alt_text_fr', type: 'varchar', length: 255, nullable: true })
  altTextFr?: string;

  @Column({ name: 'alt_text_en', type: 'varchar', length: 255, nullable: true })
  altTextEn?: string;

  @Column({ name: 'display_order', type: 'integer', default: 0 })
  displayOrder: number;

  @Column({ name: 'is_primary', type: 'boolean', default: false })
  isPrimary: boolean;

  @Column({ name: 'storage_key', type: 'varchar', length: 500, nullable: true })
  storageKey?: string;

  @Column({ name: 'file_size', type: 'integer', nullable: true })
  fileSize?: number;

  @Column({ name: 'mime_type', type: 'varchar', length: 50, nullable: true })
  mimeType?: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => Product, (product) => product.images, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product: Product;
}
