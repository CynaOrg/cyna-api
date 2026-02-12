import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '@cyna-api/common';

@Entity('contact_messages')
export class ContactMessage extends BaseEntity {
  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'varchar', length: 255 })
  @Index('idx_contact_message_email')
  email: string;

  @Column({ type: 'varchar', length: 300 })
  subject: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ name: 'is_read', type: 'boolean', default: false })
  isRead: boolean;

  @Column({ name: 'is_processed', type: 'boolean', default: false })
  isProcessed: boolean;

  @Column({ name: 'processed_by', type: 'uuid', nullable: true })
  processedBy?: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;
}
