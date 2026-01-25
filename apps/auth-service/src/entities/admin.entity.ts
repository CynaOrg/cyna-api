import {
  Entity,
  Column,
  Index,
  OneToMany,
} from 'typeorm';
import { BaseEntity, AdminRole } from '@cyna-api/common';
import { Admin2FACode } from './admin-2fa-code.entity';
import { RefreshToken } from './refresh-token.entity';

@Entity('admins')
export class Admin extends BaseEntity {
  @Column({ type: 'varchar', length: 255, unique: true })
  @Index('idx_admin_email')
  email: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 255 })
  passwordHash: string;

  @Column({ name: 'first_name', type: 'varchar', length: 100 })
  firstName: string;

  @Column({ name: 'last_name', type: 'varchar', length: 100 })
  lastName: string;

  @Column({
    type: 'enum',
    enum: AdminRole,
    default: AdminRole.COMMERCIAL,
  })
  role: AdminRole;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt?: Date;

  @OneToMany(() => Admin2FACode, (code) => code.admin)
  twoFactorCodes: Admin2FACode[];

  @OneToMany(() => RefreshToken, (token) => token.admin)
  refreshTokens: RefreshToken[];
}
