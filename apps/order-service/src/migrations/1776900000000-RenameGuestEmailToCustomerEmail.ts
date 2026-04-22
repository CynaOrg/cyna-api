import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameGuestEmailToCustomerEmail1776900000000 implements MigrationInterface {
  name = 'RenameGuestEmailToCustomerEmail1776900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orders" ADD COLUMN "customer_email" varchar(255)`);

    await queryRunner.query(
      `UPDATE "orders" SET "customer_email" = "guest_email" WHERE "guest_email" IS NOT NULL`,
    );

    // Legacy user orders that predate this migration: the email is owned by auth-service
    // and can't be resolved from a migration context. Mark them so they remain queryable
    // and a later one-shot backfill script can replace these placeholders.
    await queryRunner.query(
      `UPDATE "orders" SET "customer_email" = 'legacy-user-' || "user_id"::text || '@cyna.local' WHERE "customer_email" IS NULL AND "user_id" IS NOT NULL`,
    );

    await queryRunner.query(`ALTER TABLE "orders" ALTER COLUMN "customer_email" SET NOT NULL`);

    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "guest_email"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orders" ADD COLUMN "guest_email" varchar(255)`);

    await queryRunner.query(
      `UPDATE "orders" SET "guest_email" = "customer_email" WHERE "user_id" IS NULL`,
    );

    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "customer_email"`);
  }
}
