import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAbandonedNotifiedAtToCarts1777400000000 implements MigrationInterface {
  name = 'AddAbandonedNotifiedAtToCarts1777400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "carts" ADD COLUMN "abandoned_notified_at" timestamptz NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_carts_abandoned_notified_at" ON "carts" ("abandoned_notified_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_carts_abandoned_notified_at"`);
    await queryRunner.query(`ALTER TABLE "carts" DROP COLUMN "abandoned_notified_at"`);
  }
}
