import { getDatabase as getNetlifyConnection } from '@netlify/database';
import { drizzle } from 'drizzle-orm/netlify-db';
import { Pool } from '@neondatabase/serverless';
import { drizzle as drizzleNeon } from 'drizzle-orm/node-postgres';
import { and, eq } from 'drizzle-orm';
import { decryptSecret } from '@/lib/crypto';
import { assertNeonConnectionString } from '@/lib/neon/connection';
import * as schema from '@/lib/db/schema';
import { byoDatabases, projects } from '@/lib/db/schema';

let connection: ReturnType<typeof getNetlifyConnection> | undefined;
let database: ReturnType<typeof createDatabase> | undefined;

function getConnection() {
  connection ??= getNetlifyConnection();
  return connection;
}

function createDatabase() {
  const client = getConnection();
  const drizzleClient = drizzle({ client, schema });
  return Object.assign(drizzleClient, { pool: client.pool });
}

type NetlifyDatabase = ReturnType<typeof createDatabase>;
type NeonDatabase = ReturnType<typeof createNeonDatabase>;
type ProjectDatabaseContext =
  | { provider: 'netlify'; database: NetlifyDatabase; pool: NetlifyDatabase['pool'] }
  | { provider: 'neon'; database: NeonDatabase; pool: Pool };

function createNeonDatabase(pool: Pool) {
  return drizzleNeon({ client: pool, schema });
}

export class ProjectDatabaseReconnectRequiredError extends Error {
  constructor() {
    super('Project database requires reconnection.');
    this.name = 'ProjectDatabaseReconnectRequiredError';
  }
}

export function getDatabase() {
  database ??= createDatabase();
  return database;
}

export function hasDatabaseConfiguration() {
  return Boolean(process.env.NETLIFY_DB_URL || process.env.NETLIFY || process.env.NETLIFY_LOCAL);
}

/**
 * Run a query against a project's selected database. BYO credentials are
 * decrypted only for this callback and its Neon pool is always closed after it.
 */
export async function withProjectDatabase<T>(
  projectId: string,
  userId: string,
  operation: (context: ProjectDatabaseContext) => Promise<T>,
): Promise<T> {
  const netlifyDatabase = getDatabase();
  const [project] = await netlifyDatabase
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1);
  if (!project) throw new Error('Project not found.');

  const [configuration] = await netlifyDatabase
    .select({ provider: byoDatabases.provider, connectionStringEncrypted: byoDatabases.connectionStringEncrypted })
    .from(byoDatabases)
    .where(eq(byoDatabases.projectId, projectId))
    .limit(1);

  if (configuration?.provider !== 'neon') {
    return operation({ provider: 'netlify', database: netlifyDatabase, pool: netlifyDatabase.pool });
  }
  if (!configuration.connectionStringEncrypted) throw new ProjectDatabaseReconnectRequiredError();

  let connectionString: string;
  try {
    connectionString = assertNeonConnectionString(decryptSecret(configuration.connectionStringEncrypted));
  } catch {
    throw new ProjectDatabaseReconnectRequiredError();
  }
  const pool = new Pool({
    connectionString,
    ssl: true,
    max: 1,
    connectionTimeoutMillis: 8_000,
    idleTimeoutMillis: 1_000,
  });

  try {
    return await operation({ provider: 'neon', database: createNeonDatabase(pool), pool });
  } finally {
    await pool.end();
  }
}

/**
 * Use `getDatabase().pool.connect()` for multi-statement transactions. The
 * `@netlify/database` `sql` helper may use a different pooled connection for
 * each call and cannot guarantee that BEGIN/COMMIT share a connection.
 */