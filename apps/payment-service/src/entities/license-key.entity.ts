import { Entity, Column, Index } from 'typeorm';
import { BaseEntity, LicenseKeyStatus } from '@cyna-api/common';

@Entity('license_keys')
@Index('idx_license_keys_order_id', ['orderId'])
@Index('idx_license_keys_user_id', ['userId'])
@Index('idx_license_keys_product_id', ['productId'])
@Index('idx_license_keys_license_key', ['licenseKey'], { unique: true })
export class LicenseKey extends BaseEntity {
  @Column({ name: 'order_id', type: 'uuid' })
  orderId: string;

  @Column({ name: 'product_id', type: 'uuid' })
  productId: string;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId: string | null;

  @Column({ name: 'license_key', type: 'varchar', length: 29, unique: true })
  licenseKey: string;

  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({
    type: 'enum',
    enum: LicenseKeyStatus,
    default: LicenseKeyStatus.ACTIVE,
  })
  status: LicenseKeyStatus;

  @Column({ name: 'activated_at', type: 'timestamptz', nullable: true })
  activatedAt: Date | null;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date | null;
}
