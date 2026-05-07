import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds a `cart_id` column on orders so we can detect a pending checkout
 * already in flight for that cart and return its existing PaymentIntent
 * instead of re-creating one (which used to fail with `Cart is empty`
 * because the previous flow cleared the cart on first call).
 *
 * The cart is now cleared only when the payment is confirmed (webhook),
 * so the user can leave + come back without losing their basket.
 */
export class AddCartIdToOrders1777500000000 implements MigrationInterface {
  name = 'AddCartIdToOrders1777500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orders" ADD COLUMN "cart_id" uuid NULL`);
    await queryRunner.query(
      `CREATE INDEX "idx_orders_cart_id_status" ON "orders" ("cart_id", "status")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_orders_cart_id_status"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "cart_id"`);
  }
}
