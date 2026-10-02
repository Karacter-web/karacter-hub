import { createHash } from 'node:crypto';

export interface ProjectMigration {
  name: string;
  sql: string;
}

export interface MigrationClient {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: T[] }>;
}

export class MigrationExecutionError extends Error {
  constructor(readonly statementIndex: number | null) {
    super('The external database rejected the schema migration.');
    this.name = 'MigrationExecutionError';
  }
}

export function splitMigrationStatements(sql: string) {
  return sql
    .split(/-->{1,2}\s*statement-breakpoint\s*/i)
    .map(statement => statement.trim())
    .filter(Boolean);
}

export function hashMigration(sql: string) {
  return createHash('sha256').update(sql).digest('hex');
}

export async function applyProjectMigrations(
  client: MigrationClient,
  projectId: string,
  migrations: ProjectMigration[],
) {
  const applied: string[] = [];
  const skipped: string[] = [];
  let statementIndex: number | null = null;
  let transactionOpen = false;

  try {
    await client.query('BEGIN');
    transactionOpen = true;
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [projectId]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        project_id uuid NOT NULL,
        name text NOT NULL,
        hash text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (project_id, name)
      )
    `);

    const history = await client.query<{ name: string; hash: string }>(
      'SELECT name, hash FROM schema_migrations WHERE project_id = $1',
      [projectId],
    );
    const known = new Map(history.rows.map(row => [row.name, row.hash]));

    for (const migration of migrations) {
      const hash = hashMigration(migration.sql);
      const previousHash = known.get(migration.name);
      if (previousHash === hash) {
        skipped.push(migration.name);
        continue;
      }
      if (previousHash) throw new MigrationExecutionError(null);

      const statements = splitMigrationStatements(migration.sql);
      for (let index = 0; index < statements.length; index += 1) {
        statementIndex = index + 1;
        try {
          await client.query(statements[index]);
        } catch {
          throw new MigrationExecutionError(statementIndex);
        }
      }

      await client.query(
        'INSERT INTO schema_migrations (project_id, name, hash) VALUES ($1, $2, $3)',
        [projectId, migration.name, hash],
      );
      known.set(migration.name, hash);
      applied.push(migration.name);
      statementIndex = null;
    }

    await client.query('COMMIT');
    transactionOpen = false;
    return { applied, skipped };
  } catch (error) {
    if (transactionOpen) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // The original failure is intentionally kept sanitized.
      }
    }
    if (error instanceof MigrationExecutionError) throw error;
    throw new MigrationExecutionError(statementIndex);
  }
}

export async function getProjectMigrationHistory(client: MigrationClient, projectId: string) {
  const result = await client.query<{ name: string; hash: string; applied_at: string }>(
    'SELECT name, hash, applied_at FROM schema_migrations WHERE project_id = $1 ORDER BY applied_at ASC',
    [projectId],
  );
  return result.rows;
}