// cyna-api/apps/user-service/src/entities/user-address.entity.ts
import { Entity, Column, Index } from 'typeorm';
import { BaseEntity } from '@cyna-api/common';

@Entity('user_addresses')
@Index('idx_user_addresses_user_id', ['userId'])
export class UserAddress extends BaseEntity {
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 50 })
  label: string;

  @Column({ name: 'recipient_name', type: 'varchar', length: 255 })
  recipientName: string;

  @Column({ type: 'varchar', length: 255 })
  street: string;

  @Column({ name: 'street_line2', type: 'varchar', length: 255, nullable: true })
  streetLine2?: string;

  @Column({ type: 'varchar', length: 100 })
  city: string;

  @Column({ name: 'postal_code', type: 'varchar', length: 20 })
  postalCode: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  state?: string;

  @Column({ type: 'char', length: 2 })
  country: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  phone?: string;

  @Column({ name: 'is_default_shipping', type: 'boolean', default: false })
  isDefaultShipping: boolean;

  @Column({ name: 'is_default_billing', type: 'boolean', default: false })
  isDefaultBilling: boolean;
}
