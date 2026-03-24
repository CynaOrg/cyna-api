import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '@cyna-api/common';

@Entity('analytics_cache')
export class AnalyticsCache extends BaseEntity {
  @Column({ name: 'metric_key', type: 'varchar', length: 100, unique: true })
  @Index('idx_analytics_cache_key')
  metricKey: string;

  @Column({ name: 'metric_value', type: 'jsonb' })
  metricValue: Record<string, unknown>;

  @Column({ name: 'calculated_at', type: 'timestamptz' })
  calculatedAt: Date;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;
}
