import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStripeInvoiceUrlToSubscriptions1777300000001 implements MigrationInterface {
  name = 'AddStripeInvoiceUrlToSubscriptions1777300000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "subscriptions" ADD COLUMN "stripe_latest_invoice_url" varchar(2048) NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "subscriptions" DROP COLUMN "stripe_latest_invoice_url"`);
  }
}
