import { Entity, Column } from 'typeorm';
import { BaseEntity } from '@cyna-api/common';

@Entity('hero_texts')
export class HeroText extends BaseEntity {
  @Column({ name: 'title_fr', type: 'varchar', length: 500 })
  titleFr: string;

  @Column({ name: 'title_en', type: 'varchar', length: 500 })
  titleEn: string;

  @Column({ name: 'subtitle_fr', type: 'varchar', length: 500, nullable: true })
  subtitleFr?: string;

  @Column({ name: 'subtitle_en', type: 'varchar', length: 500, nullable: true })
  subtitleEn?: string;
}
