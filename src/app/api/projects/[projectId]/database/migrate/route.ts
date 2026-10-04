import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { ProjectDatabaseReconnectRequiredError, withProjectDatabase } from '@/db';
import { MigrationExecutionError, applyProjectMigrations, getProjectMigrationHistory, hashMigration } from '@/lib/neon/migrations';
import { extractProjectMigrations } from '@/lib/projects/migration-files';
import { getOwnedProject } from '@/lib/projects/ownership';

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

function errorCode(error: unknown) {
  return error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
}

function isReconnectError(error: unknown) {
  return ['28P01', '3D000', '08001', '08004', 'ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT'].includes(errorCode(error));
}

async function loadOwnedProject(projectId: string, userId: string) {
  const project = await getOwnedProject(projectId, userId);
  if (!project) return null;
  return { project, migrations: extractProjectMigrations(project.fileTree) };
}

export async function GET(_request: Request, { params }: RouteContext) {
  const { projectId } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });

  try {
    const owned = await loadOwnedProject(projectId, session.user.id);
    if (!owned) return NextResponse.json({ error: 'Project not found.' }, { status: 404 });

    const preview = await withProjectDatabase(projectId, session.user.id, async context => {
      const client = await context.pool.connect();
      try {
        let history: Array<{ name: string; hash: string }> = [];
        try {
          history = (await getProjectMigrationHistory(client, projectId)).map(({ name, hash }) => ({ name, hash }));
        } catch (error) {
          if (errorCode(error) !== '42P01') throw error;
        }
        const applied = new Map(history.map(item => [item.name, item.hash]));
        return {
          provider: 'neon' as const,
          migrations: owned.migrations.map(migration => {
            const previousHash = applied.get(migration.name);
            return {
              name: migration.name,
              sql: migration.sql,
              status: !previousHash ? 'pending' : previousHash === hashMigration(migration.sql) ? 'applied' : 'modified',
            };
          }),
        };
      } finally {
        client.release();
      }
    });
    return NextResponse.json(preview);
  } catch {
    return NextResponse.json({ error: 'Migration preview is unavailable.', code: 'reconnect_required' }, { status: 503 });
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  const { projectId } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body.' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || (body as Record<string, unknown>).confirm !== true) {
    return NextResponse.json({ error: 'Explicit confirmation is required.' }, { status: 400 });
  }

  try {
    const owned = await loadOwnedProject(projectId, session.user.id);
    if (!owned) return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
    if (!owned.migrations.length) return NextResponse.json({ applied: [], skipped: [] });

    const result = await withProjectDatabase(projectId, session.user.id, async context => {
      const client = await context.pool.connect();
      try {
        return await applyProjectMigrations(client, projectId, owned.migrations);
      } finally {
        client.release();
      }
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof MigrationExecutionError) {
      return NextResponse.json({
        error: 'migration_failed',
        statementIndex: error.statementIndex,
        message: 'The external database rejected the schema migration. No changes were committed.',
      }, { status: 400 });
    }
    if (isReconnectError(error) || error instanceof ProjectDatabaseReconnectRequiredError) {
      return NextResponse.json({ error: 'reconnect_required' }, { status: 409 });
    }
    return NextResponse.json({ error: 'migration_failed', message: 'The external database could not be reached.' }, { status: 503 });
  }
}