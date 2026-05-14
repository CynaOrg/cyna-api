import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Hash admin 2FA codes at rest.
 *
 * The `code` column is widened from varchar(6) (cleartext) to varchar(64)
 * (SHA-256 hex digest). Any active codes are dropped because they cannot be
 * re-hashed without the plaintext value; admins who were mid-2FA will receive
 * a fresh code on their next login.
 */
export class HashAdmin2FACodes1777600000000 implements MigrationInterface {
  name = 'HashAdmin2FACodes1777600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`TRUNCATE TABLE "admin_2fa_codes"`);
    await queryRunner.query(`ALTER TABLE "admin_2fa_codes" ALTER COLUMN "code" TYPE varchar(64)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`TRUNCATE TABLE "admin_2fa_codes"`);
    await queryRunner.query(`ALTER TABLE "admin_2fa_codes" ALTER COLUMN "code" TYPE varchar(6)`);
  }
}
