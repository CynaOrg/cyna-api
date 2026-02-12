import { Entity, Column } from 'typeorm';
import { BaseEntity } from '@cyna-api/common';

@Entity('carousel_slides')
export class CarouselSlide extends BaseEntity {
  @Column({ name: 'title_fr', type: 'varchar', length: 200 })
  titleFr: string;

  @Column({ name: 'title_en', type: 'varchar', length: 200 })
  titleEn: string;

  @Column({ name: 'subtitle_fr', type: 'varchar', length: 100, nullable: true })
  subtitleFr?: string;

  @Column({ name: 'subtitle_en', type: 'varchar', length: 100, nullable: true })
  subtitleEn?: string;

  @Column({ name: 'image_url', type: 'varchar', length: 500, nullable: true })
  imageUrl?: string;

  @Column({ name: 'link_url', type: 'varchar', length: 500, nullable: true })
  linkUrl?: string;

  @Column({ name: 'link_text_fr', type: 'varchar', length: 50, nullable: true })
  linkTextFr?: string;

  @Column({ name: 'link_text_en', type: 'varchar', length: 50, nullable: true })
  linkTextEn?: string;

  @Column({ name: 'display_order', type: 'integer', default: 0 })
  displayOrder: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;
}
