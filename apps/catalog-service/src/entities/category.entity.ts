import { Entity, Column, Index, OneToMany } from 'typeorm';
import { BaseEntity } from '@cyna-api/common';
import { Product } from './product.entity';

@Entity('categories')
export class Category extends BaseEntity {
  @Column({ type: 'varchar', length: 100, unique: true })
  @Index('idx_category_slug')
  slug: string;

  @Column({ name: 'name_fr', type: 'varchar', length: 100 })
  nameFr: string;

  @Column({ name: 'name_en', type: 'varchar', length: 100 })
  nameEn: string;

  @Column({ name: 'description_fr', type: 'text', nullable: true })
  descriptionFr?: string;

  @Column({ name: 'description_en', type: 'text', nullable: true })
  descriptionEn?: string;

  @Column({ name: 'image_url', type: 'varchar', length: 500, nullable: true })
  imageUrl?: string;

  @Column({ name: 'display_order', type: 'integer', default: 0 })
  displayOrder: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @OneToMany(() => Product, (product) => product.category)
  products: Product[];
}
