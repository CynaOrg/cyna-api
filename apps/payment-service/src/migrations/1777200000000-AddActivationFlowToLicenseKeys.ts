import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddActivationFlowToLicenseKeys1777200000000 implements MigrationInterface {
  name = 'AddActivationFlowToLicenseKeys1777200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Deactivate existing rows: in Option B the license is inert until the
    // customer follows the activation link. Existing rows that were created
    // under the previous flow keep their activatedAt (backfill-safe).
    await queryRunner.query(
      `ALTER TABLE "license_keys" ADD COLUMN "activation_token_hash" varchar(64) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "license_keys" ADD COLUMN "activation_token_expires_at" timestamptz NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "idx_license_keys_activation_token_hash" ON "license_keys" ("activation_token_hash") WHERE "activation_token_hash" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_license_keys_activation_token_hash"`);
    await queryRunner.query(`ALTER TABLE "license_keys" DROP COLUMN "activation_token_expires_at"`);
    await queryRunner.query(`ALTER TABLE "license_keys" DROP COLUMN "activation_token_hash"`);
  }
}
