import { and, eq, isNull } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getBrowserSession } from '@/lib/db/browser-session';
import { getDatabase } from '@/lib/db';
import { parseProjectInput } from '@/lib/db/project-validation';
import { projects } from '@/lib/db/schema';

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, { params }: RouteContext) {
  const { projectId } = await params;
  if (!UUID_PATTERN.test(projectId)) {
    return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
  }

  try {
    const user = await auth();
    if (user?.user?.id) {
      const [project] = await getDatabase()
        .select()
        .from(projects)
        .where(and(eq(projects.id, projectId), eq(projects.userId, user.user.id)))
        .limit(1);

      if (!project) return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
      return NextResponse.json({ project });
    }

    const session = await getBrowserSession();
    if (!session) return NextResponse.json({ error: 'Project not found.' }, { status: 404 });

    const [project] = await getDatabase()
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.sessionId, session.id), isNull(projects.userId)))
      .limit(1);

    if (!project) return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
    return NextResponse.json({ project });
  } catch {
    return NextResponse.json({ error: 'Project storage is unavailable.' }, { status: 503 });
  }
}

export async function PUT(request: Request, { params }: RouteContext) {
  const { projectId } = await params;
  if (!UUID_PATTERN.test(projectId)) {
    return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
  }

  try {
    const user = await auth();
    const owner = user?.user?.id;
    const session = await getBrowserSession();
    if (!owner && !session) return NextResponse.json({ error: 'Project not found.' }, { status: 404 });

    const input = parseProjectInput(await request.json());
    if (!input) {
      return NextResponse.json({ error: 'Invalid project data.' }, { status: 400 });
    }

    const [project] = await getDatabase()
      .update(projects)
      .set({
        ...input,
        updatedAt: new Date(),
      })
      .where(owner
        ? and(eq(projects.id, projectId), eq(projects.userId, owner))
        : and(eq(projects.id, projectId), eq(projects.sessionId, session!.id), isNull(projects.userId)))
      .returning({
        id: projects.id,
        name: projects.name,
        description: projects.description,
        gitRepoUrl: projects.gitRepoUrl,
        fileTree: projects.fileTree,
        updatedAt: projects.updatedAt,
      });

    if (!project) return NextResponse.json({ error: 'Project not found.' }, { status: 404 });
    return NextResponse.json({ project });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON request body.' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Project storage is unavailable.' }, { status: 503 });
  }
}