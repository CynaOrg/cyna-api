import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStripeInvoiceToOrders1777300000000 implements MigrationInterface {
  name = 'AddStripeInvoiceToOrders1777300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN "stripe_invoice_id" varchar(255) NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD COLUMN "stripe_invoice_url" varchar(2048) NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "stripe_invoice_url"`);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "stripe_invoice_id"`);
  }
}
