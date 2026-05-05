import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAttemptsToAdmin2FACodes1746000000000 implements MigrationInterface {
  name = 'AddAttemptsToAdmin2FACodes1746000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "admin_2fa_codes" ADD COLUMN "attempts" integer NOT NULL DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "admin_2fa_codes" DROP COLUMN "attempts"`);
  }
}
