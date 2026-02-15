import { Entity, Column } from 'typeorm';
import { BaseEntity } from '@cyna-api/common';

@Entity('top_product_configs')
export class TopProductConfig extends BaseEntity {
  @Column({ name: 'config_type', type: 'varchar', length: 50, unique: true })
  configType: string;

  @Column({ name: 'product_ids', type: 'jsonb', default: [] })
  productIds: string[];
}
