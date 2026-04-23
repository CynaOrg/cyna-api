import {
  Entity,
  Column,
  Index,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Admin } from './admin.entity';

@Entity('refresh_tokens')
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  @Index('idx_refresh_user')
  userId?: string;

  @Column({ name: 'admin_id', type: 'uuid', nullable: true })
  @Index('idx_refresh_admin')
  adminId?: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  @Index('idx_refresh_token')
  token: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt?: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @ManyToOne(() => Admin, (admin) => admin.refreshTokens, { onDelete: 'CASCADE', nullable: true })
  @JoinColumn({ name: 'admin_id' })
  admin?: Admin;
}
