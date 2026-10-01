import { NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import { getDatabase } from '@/lib/db';
import { getBrowserSession, getOrCreateBrowserSession, setBrowserSessionCookie } from '@/lib/db/browser-session';
import { parseProjectInput } from '@/lib/db/project-validation';
import { projects } from '@/lib/db/schema';

export async function GET() {
  try {
    if (!process.env.DATABASE_URL) {
      return NextResponse.json({ error: 'Project storage is not configured.' }, { status: 503 });
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
  } catch (error) {
    console.error('Project library lookup failed:', error);
    return NextResponse.json({ error: 'Project storage is unavailable.' }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const input = parseProjectInput(await request.json());
    if (!input) return NextResponse.json({ error: 'Invalid project data.' }, { status: 400 });

    const session = await getOrCreateBrowserSession();
    const [project] = await getDatabase()
      .insert(projects)
      .values({ ...input, sessionId: session.id })
      .returning({
        id: projects.id,
        name: projects.name,
        description: projects.description,
        gitRepoUrl: projects.gitRepoUrl,
        fileTree: projects.fileTree,
        updatedAt: projects.updatedAt,
      });

    const response = NextResponse.json({ project }, { status: 201 });
    return setBrowserSessionCookie(response, session.token);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return NextResponse.json({ error: 'Invalid JSON request body.' }, { status: 400 });
    }
    console.error('Project creation failed:', error);
    return NextResponse.json({ error: 'Project storage is unavailable.' }, { status: 503 });
  }
}