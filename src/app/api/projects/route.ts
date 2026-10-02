import { NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { hasDatabaseConfiguration } from '@/db';
import { getBrowserSession } from '@/lib/db/browser-session';
import { parseProjectInput } from '@/lib/db/project-validation';
import { projects } from '@/lib/db/schema';

export async function GET() {
  try {
    if (!hasDatabaseConfiguration()) {
      return NextResponse.json({ error: 'Project storage is not configured.' }, { status: 503 });
    }
    const user = await auth();
    if (user?.user?.id) {
      const ownedProjects = await getDatabase()
        .select({
          id: projects.id,
          name: projects.name,
          description: projects.description,
          updatedAt: projects.updatedAt,
        })
        .from(projects)
        .where(eq(projects.userId, user.user.id))
        .orderBy(desc(projects.updatedAt));

      return NextResponse.json({ projects: ownedProjects });
    }

    const session = await getBrowserSession();
    if (!session) return NextResponse.json({ projects: [] });

    const savedProjects = await getDatabase()
      .select({
        id: projects.id,
        name: projects.name,
        description: projects.description,
        updatedAt: projects.updatedAt,
      })
      .from(projects)
      .where(eq(projects.sessionId, session.id))
      .orderBy(desc(projects.updatedAt));

    return NextResponse.json({ projects: savedProjects });
  } catch {
    return NextResponse.json({ error: 'Project storage is unavailable.' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const user = await auth();
    if (!user?.user?.id) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });

    const input = parseProjectInput(await request.json());
    if (!input) return NextResponse.json({ error: 'Invalid project data.' }, { status: 400 });

    const [project] = await getDatabase()
      .insert(projects)
      .values({
        ...input,
        sessionId: null,
        userId: user.user.id,
      })
      .returning({
        id: projects.id,
        name: projects.name,
        description: projects.description,
        gitRepoUrl: projects.gitRepoUrl,
        fileTree: projects.fileTree,
        updatedAt: projects.updatedAt,
      });

    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON request body.' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Project storage is unavailable.' }, { status: 503 });
  }
}