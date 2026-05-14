import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Idempotence guard for Stripe webhook deliveries.
 *
 * WebhookService.tryClaimEvent inserts the eventId into this table inside
 * a unique-violation race so concurrent deliveries of the same event (slow
 * primary delivery + Stripe retry) cannot double-process. The table was
 * previously created only by TypeORM synchronize:true in development; with
 * the production synchronize guard, it must be migrated explicitly.
 */
export class CreateProcessedWebhooksTable1777600000001 implements MigrationInterface {
  name = 'CreateProcessedWebhooksTable1777600000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "processed_webhooks" (
        "event_id" varchar(255) NOT NULL,
        "processed_at" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "event_type" varchar(100) NOT NULL,
        CONSTRAINT "PK_processed_webhooks_event_id" PRIMARY KEY ("event_id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_processed_webhooks_processed_at" ON "processed_webhooks" ("processed_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_processed_webhooks_processed_at"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "processed_webhooks"`);
  }
}
