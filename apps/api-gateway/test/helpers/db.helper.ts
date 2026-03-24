import { DataSource } from 'typeorm';

/**
 * Truncates all tables managed by the auth-service DataSource.
 * Uses CASCADE to handle foreign key constraints.
 * Call in beforeEach to ensure test isolation.
 */
export async function cleanDatabase(dataSource: DataSource): Promise<void> {
  const entities = dataSource.entityMetadatas;
  for (const entity of entities) {
    const repository = dataSource.getRepository(entity.name);
    await repository.query(`TRUNCATE TABLE "${entity.tableName}" CASCADE`);
  }
}
