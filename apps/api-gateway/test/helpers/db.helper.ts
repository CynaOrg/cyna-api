import { DataSource } from 'typeorm';

/**
 * Truncates all tables managed by the given DataSource(s).
 * Uses CASCADE to handle foreign key constraints.
 * The first DataSource drives the query connection; entity metadata is
 * collected from all provided DataSources so that tables owned by other
 * services (e.g. user-service users) are also truncated.
 * Call in beforeEach to ensure test isolation.
 */
export async function cleanDatabase(
  dataSource: DataSource,
  ...extraDataSources: DataSource[]
): Promise<void> {
  const tables = new Set<string>();
  for (const ds of [dataSource, ...extraDataSources]) {
    for (const entity of ds.entityMetadatas) {
      tables.add(entity.tableName);
    }
  }
  for (const table of tables) {
    await dataSource.query(`TRUNCATE TABLE "${table}" CASCADE`);
  }
}
