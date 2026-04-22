import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductSnapshotToLicenseKeys1776845407292 implements MigrationInterface {
  name = 'AddProductSnapshotToLicenseKeys1776845407292';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "license_keys" ADD COLUMN "product_snapshot" jsonb NOT NULL DEFAULT '{"nameFr":"Licence","nameEn":"License","slug":"unknown"}'::jsonb`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "license_keys" DROP COLUMN "product_snapshot"`);
  }
}
