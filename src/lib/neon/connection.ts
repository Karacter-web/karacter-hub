import { Pool } from '@neondatabase/serverless';

export interface NeonPoolClient {
  query(text: string, values?: unknown[]): Promise<unknown>;
  release(): void;
}

export interface NeonPoolLike {
  connect(): Promise<NeonPoolClient>;
  end(): Promise<void>;
}

export function assertNeonConnectionString(value: string) {
  if (value.length > 8_192) throw new Error('Connection string is invalid.');

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('Connection string is invalid.');
  }

  const allowedHost = parsed.hostname === 'neon.tech' || parsed.hostname.endsWith('.neon.tech');
  if (
    !['postgres:', 'postgresql:'].includes(parsed.protocol) ||
    !allowedHost ||
    !parsed.username ||
    !parsed.password
  ) {
    throw new Error('Enter a valid Neon PostgreSQL connection string.');
  }

  return value;
}

export function createNeonPool(connectionString: string): NeonPoolLike {
  return new Pool({
    connectionString: assertNeonConnectionString(connectionString),
    ssl: true,
    max: 1,
    connectionTimeoutMillis: 8_000,
    idleTimeoutMillis: 1_000,
  });
}

export async function testNeonConnection(
  connectionString: string,
  createPool: (connectionString: string) => NeonPoolLike = createNeonPool,
) {
  const pool = createPool(assertNeonConnectionString(connectionString));
  try {
    const client = await pool.connect();
    try {
      await client.query('select 1');
    } finally {
      client.release();
    }
  } finally {
    await pool.end();
  }
}