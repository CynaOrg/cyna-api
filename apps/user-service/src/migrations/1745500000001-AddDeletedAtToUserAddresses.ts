import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDeletedAtToUserAddresses1745500000001 implements MigrationInterface {
  name = 'AddDeletedAtToUserAddresses1745500000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_addresses" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMPTZ;`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "user_addresses" DROP COLUMN IF EXISTS "deleted_at";`);
  }
}
