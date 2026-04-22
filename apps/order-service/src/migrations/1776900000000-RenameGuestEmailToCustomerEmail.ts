import { MigrationInterface, QueryRunner } from 'typeorm';

export class RenameGuestEmailToCustomerEmail1776900000000 implements MigrationInterface {
  name = 'RenameGuestEmailToCustomerEmail1776900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orders" ADD COLUMN "customer_email" varchar(255)`);

    // Guest orders already carry their email — copy it over.
    await queryRunner.query(
      `UPDATE "orders" SET "customer_email" = "guest_email" WHERE "guest_email" IS NOT NULL`,
    );

    // Legacy user orders (userId set, guest_email null) cannot be backfilled from the
    // migration — the email lives in auth-service. The SET NOT NULL below will fail
    // loudly if any such rows remain. Operators must run a one-shot script that joins
    // orders.user_id against auth-service before applying this migration. For fresh
    // databases and dev/CI environments this is a no-op.
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
