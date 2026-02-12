import { Entity, PrimaryColumn, Column } from 'typeorm';

@Entity('processed_webhooks')
export class ProcessedWebhook {
  @PrimaryColumn({ name: 'event_id', type: 'varchar', length: 255 })
  eventId: string;

  @Column({ name: 'processed_at', type: 'timestamptz', default: () => 'CURRENT_TIMESTAMP' })
  processedAt: Date;

  @Column({ name: 'event_type', type: 'varchar', length: 100 })
  eventType: string;
}
