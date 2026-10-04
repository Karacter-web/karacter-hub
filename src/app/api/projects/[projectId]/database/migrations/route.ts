import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { withProjectDatabase } from '@/db';
import { getProjectMigrationHistory } from '@/lib/neon/migrations';
import { getOwnedProject } from '@/lib/projects/ownership';

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

function getErrorCode(error: unknown) {
  return error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
}

export async function GET(_request: Request, { params }: RouteContext) {
  const { projectId } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });
  if (!await getOwnedProject(projectId, session.user.id)) {
    return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
  }

  try {
    const migrations = await withProjectDatabase(projectId, session.user.id, async context => {
      const client = await context.pool.connect();
      try {
        return await getProjectMigrationHistory(client, projectId);
      } finally {
        client.release();
      }
    });
    return NextResponse.json({ migrations });
  } catch (error) {
    if (getErrorCode(error) === '42P01') return NextResponse.json({ migrations: [] });
    return NextResponse.json({ error: 'Migration history is unavailable.', code: 'reconnect_required' }, { status: 503 });
  }
}