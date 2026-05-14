import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Catalog only ships three public categories: Produits (physical), Licences,
 * Abonnements (SaaS). The original seed shipped the SaaS bucket as "services",
 * which doesn't read well next to its hardware/license siblings in the
 * back-office picker — so we rename it. Also ensures the other two exist on
 * dev/staging boxes that were started without CATALOG_SEED_ENABLED.
 *
 * Idempotent: re-running on a DB that already holds 'abonnements' is a no-op
 * thanks to ON CONFLICT and the WHERE clause on the UPDATE.
 */
export class RenameServicesCategoryToAbonnements1779000000000 implements MigrationInterface {
  name = 'RenameServicesCategoryToAbonnements1779000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Defensive: if a previous half-run left both rows around, drop the old
    // one so the rename below doesn't trip the unique constraint on slug.
    await queryRunner.query(`
      DELETE FROM "categories"
      WHERE "slug" = 'services'
      AND EXISTS (SELECT 1 FROM "categories" WHERE "slug" = 'abonnements')
    `);

    // Rename the SaaS bucket in place so products already linked to it keep
    // their FK (categories.id is stable; only slug + display name change).
    await queryRunner.query(`
      UPDATE "categories"
      SET "slug" = 'abonnements',
          "name_fr" = 'Abonnements',
          "name_en" = 'Subscriptions',
          "description_fr" = 'Abonnements SaaS de cybersécurité pour protéger votre entreprise',
          "description_en" = 'Cybersecurity SaaS subscriptions to protect your business',
          "display_order" = 1,
          "updated_at" = NOW()
      WHERE "slug" = 'services'
    `);

    // Ensure all three categories exist (fresh DB without seed enabled).
    await queryRunner.query(`
      INSERT INTO "categories"
        ("id", "slug", "name_fr", "name_en", "description_fr", "description_en", "display_order", "is_active", "created_at", "updated_at")
      VALUES
        (gen_random_uuid(), 'abonnements', 'Abonnements', 'Subscriptions',
         'Abonnements SaaS de cybersécurité pour protéger votre entreprise',
         'Cybersecurity SaaS subscriptions to protect your business',
         1, true, NOW(), NOW())
      ON CONFLICT ("slug") DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO "categories"
        ("id", "slug", "name_fr", "name_en", "description_fr", "description_en", "display_order", "is_active", "created_at", "updated_at")
      VALUES
        (gen_random_uuid(), 'produits', 'Produits', 'Products',
         'Équipements et produits physiques de cybersécurité',
         'Cybersecurity hardware and physical products',
         2, true, NOW(), NOW())
      ON CONFLICT ("slug") DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO "categories"
        ("id", "slug", "name_fr", "name_en", "description_fr", "description_en", "display_order", "is_active", "created_at", "updated_at")
      VALUES
        (gen_random_uuid(), 'licences', 'Licences', 'Licenses',
         'Licences logicielles professionnelles avec activation',
         'Professional software licenses with activation',
         3, true, NOW(), NOW())
      ON CONFLICT ("slug") DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore the old slug/name. We don't delete 'produits' / 'licences' here:
    // products may already point at them and dropping rows would cascade or fail.
    await queryRunner.query(`
      UPDATE "categories"
      SET "slug" = 'services',
          "name_fr" = 'Services',
          "name_en" = 'Services',
          "description_fr" = 'Solutions SaaS de cybersécurité pour protéger votre entreprise',
          "description_en" = 'Cybersecurity SaaS solutions to protect your business',
          "updated_at" = NOW()
      WHERE "slug" = 'abonnements'
    `);
  }
}
