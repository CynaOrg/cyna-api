import {
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';

/**
 * Base Entity
 * Abstract entity with common fields for all database entities
 * Provides UUID primary key and automatic timestamp management
 */
export abstract class BaseEntity {
  /**
   * Unique identifier (UUID v4)
   */
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Creation timestamp - automatically set on insert
   */
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  /**
   * Update timestamp - automatically updated on each save
   */
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  /**
   * Soft delete timestamp - used for soft deletes
   * When set, the entity is considered deleted but retained in the database
   */
  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt?: Date;
}
