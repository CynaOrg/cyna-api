import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddImageUploadColumns1739451600000 implements MigrationInterface {
  name = 'AddImageUploadColumns1739451600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "product_images" ADD "storage_key" varchar(500)`);
    await queryRunner.query(`ALTER TABLE "product_images" ADD "file_size" integer`);
    await queryRunner.query(`ALTER TABLE "product_images" ADD "mime_type" varchar(50)`);
    await queryRunner.query(
      `CREATE INDEX "idx_product_image_storage_key" ON "product_images" ("storage_key")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_product_image_storage_key"`);
    await queryRunner.query(`ALTER TABLE "product_images" DROP COLUMN "mime_type"`);
    await queryRunner.query(`ALTER TABLE "product_images" DROP COLUMN "file_size"`);
    await queryRunner.query(`ALTER TABLE "product_images" DROP COLUMN "storage_key"`);
  }
}
