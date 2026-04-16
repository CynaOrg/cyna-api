import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNotificationSnapshotToSubscriptions1745000000001 implements MigrationInterface {
  name = 'AddNotificationSnapshotToSubscriptions1745000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "subscriptions_notification_language_enum" AS ENUM('fr', 'en')`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscriptions" ADD COLUMN "notification_email" VARCHAR(255) DEFAULT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscriptions" ADD COLUMN "notification_language" "subscriptions_notification_language_enum" DEFAULT NULL`,
    );
    // Backfill: legacy rows default to 'fr'. Cross-DB backfill to users.preferred_language
    // is not possible. Renewal emails for pre-existing subscriptions will be in French
    // until the user creates a new subscription.
    await queryRunner.query(
      `UPDATE "subscriptions" SET "notification_language" = 'fr' WHERE "notification_language" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "subscriptions" DROP COLUMN "notification_language"`);
    await queryRunner.query(`ALTER TABLE "subscriptions" DROP COLUMN "notification_email"`);
    await queryRunner.query(`DROP TYPE "subscriptions_notification_language_enum"`);
  }
}
