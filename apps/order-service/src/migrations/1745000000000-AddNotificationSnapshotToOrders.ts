import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNotificationSnapshotToOrders1745000000000 implements MigrationInterface {
  name = 'AddNotificationSnapshotToOrders1745000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE TYPE "orders_notification_language_enum" AS ENUM('fr', 'en')`);
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN "notification_email" VARCHAR(255) DEFAULT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN "notification_language" "orders_notification_language_enum" DEFAULT NULL`,
    );
    // Backfill: guest orders carry their email in guest_email; copy it over.
    await queryRunner.query(
      `UPDATE "orders" SET "notification_email" = "guest_email" WHERE "user_id" IS NULL AND "guest_email" IS NOT NULL`,
    );
    // Default language for legacy rows. Cross-DB backfill to users.preferred_language
    // is not possible (users live in auth-service DB). New rows will populate correctly
    // via order.service.ts.
    await queryRunner.query(
      `UPDATE "orders" SET "notification_language" = 'fr' WHERE "notification_language" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "notification_language"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "notification_email"`);
    await queryRunner.query(`DROP TYPE "orders_notification_language_enum"`);
  }
}
