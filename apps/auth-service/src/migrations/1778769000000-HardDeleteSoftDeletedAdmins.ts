import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Hard-delete admins that were previously soft-deleted.
 *
 * `deleteAdmin` now hard-removes admins so the unique constraint on email
 * doesn't block recreation with the same address. Existing rows still carry
 * a `deleted_at` value from the soft-remove era and continue to occupy their
 * email — this migration purges them in one shot so the new policy is the
 * only one observable in production.
 */
export class HardDeleteSoftDeletedAdmins1778769000000 implements MigrationInterface {
  name = 'HardDeleteSoftDeletedAdmins1778769000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DELETE FROM "admins" WHERE "deleted_at" IS NOT NULL`);
  }

  public async down(): Promise<void> {
    // Irreversible: deleted rows cannot be reconstructed.
  }
}
