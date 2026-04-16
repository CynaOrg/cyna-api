import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNotificationSnapshotToSubscriptions1745000000001 implements MigrationInterface {
  name = 'AddNotificationSnapshotToSubscriptions1745000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Idempotent: safe to re-run after a partial failure.
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "subscriptions_notification_language_enum" AS ENUM('fr', 'en');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$;
    `);
    await queryRunner.query(
      `ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "notification_email" VARCHAR(255) DEFAULT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "notification_language" "subscriptions_notification_language_enum" DEFAULT NULL`,
    );
    // Backfill: legacy rows default to 'fr'. Cross-DB backfill to users.preferred_language
    // is not possible. Renewal emails for pre-existing subscriptions will be in French
    // until the user creates a new subscription.
    await queryRunner.query(
      `UPDATE "subscriptions" SET "notification_language" = 'fr' WHERE "notification_language" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "subscriptions" DROP COLUMN IF EXISTS "notification_language"`,
    );
    await queryRunner.query(
      `ALTER TABLE "subscriptions" DROP COLUMN IF EXISTS "notification_email"`,
    );
    await queryRunner.query(`DROP TYPE IF EXISTS "subscriptions_notification_language_enum"`);
  }
}
