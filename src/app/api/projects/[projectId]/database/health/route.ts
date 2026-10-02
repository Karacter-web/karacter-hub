import { sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { withProjectDatabase } from '@/db';
import { getOwnedProject } from '@/lib/projects/ownership';

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

export async function GET(_request: Request, { params }: RouteContext) {
  const { projectId } = await params;
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });

  try {
    const project = await getOwnedProject(projectId, session.user.id);
    if (!project) return NextResponse.json({ error: 'Project not found.' }, { status: 404 });

    const result = await withProjectDatabase(projectId, session.user.id, async ({ provider, database }) => {
      await database.execute(sql`select 1`);
      return { provider };
    });
    return NextResponse.json({ ok: true, provider: result.provider });
  } catch {
    return NextResponse.json({ ok: false, error: 'reconnect_required' }, { status: 503 });
  }
}