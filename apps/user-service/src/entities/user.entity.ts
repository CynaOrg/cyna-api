import { Entity, Column, Index } from 'typeorm';
import { BaseEntity, Language } from '@cyna-api/common';

@Entity('users')
export class User extends BaseEntity {
  @Column({ type: 'varchar', length: 255, unique: true })
  @Index('idx_user_email')
  email: string;

  // select: false keeps the bcrypt hash out of any default findOne / find /
  // save round-trip. Endpoints that need the hash for verification must opt in
  // explicitly via QueryBuilder.addSelect('user.passwordHash').
  @Column({ name: 'password_hash', type: 'varchar', length: 255, select: false })
  passwordHash: string;

  @Column({ name: 'first_name', type: 'varchar', length: 100 })
  firstName: string;

  @Column({ name: 'last_name', type: 'varchar', length: 100 })
  lastName: string;

  @Column({ name: 'company_name', type: 'varchar', length: 255, nullable: true })
  companyName?: string;

  @Column({ name: 'vat_number', type: 'varchar', length: 50, nullable: true })
  vatNumber?: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'is_verified', type: 'boolean', default: false })
  isVerified: boolean;

  @Column({
    name: 'preferred_language',
    type: 'enum',
    enum: Language,
    default: Language.FR,
  })
  preferredLanguage: Language;

  @Column({
    name: 'stripe_customer_id',
    type: 'varchar',
    length: 255,
    nullable: true,
    unique: true,
  })
  @Index('idx_user_stripe')
  stripeCustomerId?: string;
}
