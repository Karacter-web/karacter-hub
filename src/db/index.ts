import { Pool } from '@neondatabase/serverless';
import { and, eq } from 'drizzle-orm';
import { drizzle as drizzleNeon } from 'drizzle-orm/node-postgres';
import { decryptSecret } from '@/lib/crypto';
import { assertNeonConnectionString } from '@/lib/neon/connection';
import * as schema from '@/lib/db/schema';
import { byoDatabases, projects } from '@/lib/db/schema';

let pool: Pool | undefined;
let database: ReturnType<typeof createNeonDatabase> | undefined;

function getPool(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) throw new Error('DATABASE_URL is required to connect to Neon.');
  return new Pool({
    connectionString: assertNeonConnectionString(connectionString),
    ssl: true,
    max: 5,
    connectionTimeoutMillis: 8_000,
    idleTimeoutMillis: 10_000,
  });
}

function createNeonDatabase(client: Pool) {
  return drizzleNeon({ client, schema });
}

export class ProjectDatabaseReconnectRequiredError extends Error {
  constructor() {
    super('Project database requires reconnection.');
    this.name = 'ProjectDatabaseReconnectRequiredError';
  }
}

function getPrimaryPool() {
  pool ??= getPool();
  return pool;
}

export function getDatabase() {
  database ??= createNeonDatabase(getPrimaryPool());
  return database;
}

export function hasDatabaseConfiguration() {
  return Boolean(process.env.DATABASE_URL);
}

type ProjectDatabaseContext = {
  provider: 'neon';
  database: ReturnType<typeof createNeonDatabase>;
  pool: Pool;
};

/**
 * Run a query against a project's configured Neon database. If it has no
 * project-specific credentials, use the application's shared Neon database.
 */
export async function withProjectDatabase<T>(
  projectId: string,
  userId: string,
  operation: (context: ProjectDatabaseContext) => Promise<T>,
): Promise<T> {
  const primaryDatabase = getDatabase();
  const primaryPool = getPrimaryPool();
  const [project] = await primaryDatabase
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1);
  if (!project) throw new Error('Project not found.');

  const [configuration] = await primaryDatabase
    .select({ connectionStringEncrypted: byoDatabases.connectionStringEncrypted })
    .from(byoDatabases)
    .where(eq(byoDatabases.projectId, projectId))
    .limit(1);

  if (!configuration?.connectionStringEncrypted) {
    return operation({ provider: 'neon', database: primaryDatabase, pool: primaryPool });
  }

  let connectionString: string;
  try {
    connectionString = assertNeonConnectionString(decryptSecret(configuration.connectionStringEncrypted));
  } catch {
    throw new ProjectDatabaseReconnectRequiredError();
  }
  const projectPool = getPool(connectionString);

  try {
    return await operation({ provider: 'neon', database: createNeonDatabase(projectPool), pool: projectPool });
  } finally {
    await projectPool.end();
  }
}
