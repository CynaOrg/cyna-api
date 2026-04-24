// cyna-api/apps/user-service/src/migrations/1745500000000-CreateUserAddressesTable.ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUserAddressesTable1745500000000 implements MigrationInterface {
  name = 'CreateUserAddressesTable1745500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_addresses" (
        "id"                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id"              UUID NOT NULL,
        "label"                VARCHAR(50)  NOT NULL,
        "recipient_name"       VARCHAR(255) NOT NULL,
        "street"               VARCHAR(255) NOT NULL,
        "street_line2"         VARCHAR(255),
        "city"                 VARCHAR(100) NOT NULL,
        "postal_code"          VARCHAR(20)  NOT NULL,
        "state"                VARCHAR(100),
        "country"              CHAR(2)      NOT NULL,
        "phone"                VARCHAR(30),
        "is_default_shipping"  BOOLEAN      NOT NULL DEFAULT FALSE,
        "is_default_billing"   BOOLEAN      NOT NULL DEFAULT FALSE,
        "created_at"           TIMESTAMPTZ  NOT NULL DEFAULT now(),
        "updated_at"           TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "fk_user_addresses_user"
          FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      );
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_user_addresses_user_id" ON "user_addresses"("user_id");`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "idx_user_addresses_default_shipping"
         ON "user_addresses"("user_id") WHERE "is_default_shipping" = TRUE;`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "idx_user_addresses_default_billing"
         ON "user_addresses"("user_id") WHERE "is_default_billing" = TRUE;`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_user_addresses_default_billing";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_user_addresses_default_shipping";`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_user_addresses_user_id";`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_addresses";`);
  }
}
