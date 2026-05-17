import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds the `incomplete` value to the subscriptions_status_enum.
 *
 * Stripe creates a subscription in `incomplete` status until the first invoice
 * is paid (we use payment_behavior='default_incomplete'). Before this change
 * we were persisting the row as ACTIVE pre-payment, which made abandoned
 * subscriptions surface as "cancelled" in the customer dashboard once Stripe
 * expired them ~23h later. The new INCOMPLETE state lets us mirror Stripe's
 * own staging state and filter these rows out of all user/admin reads until
 * the payment webhook confirms them.
 *
 * PostgreSQL ALTER TYPE ADD VALUE is non-transactional in pg <12 and cannot
 * run inside an explicit transaction. NestJS/TypeORM migrations run each
 * migration in its own transaction, but `ALTER TYPE ... ADD VALUE IF NOT
 * EXISTS` is safe to run repeatedly and is idempotent — we let TypeORM manage
 * the surrounding transaction and rely on IF NOT EXISTS for re-runs.
 */
export class AddIncompleteSubscriptionStatus1777700000001 implements MigrationInterface {
  name = 'AddIncompleteSubscriptionStatus1777700000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "subscriptions_status_enum" ADD VALUE IF NOT EXISTS 'incomplete'`,
    );
  }

  public async down(): Promise<void> {
    // PostgreSQL does not support removing values from an enum without
    // recreating the type. We intentionally leave the value in place on
    // rollback — the application code will simply stop using it. Recreating
    // the type requires a column rewrite that is unsafe in production.
  }
}
