import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { hasDatabaseConfiguration, getDatabase } from '@/db';
import { encryptSecret } from '@/lib/crypto';
import { testNeonConnection } from '@/lib/neon/connection';
import { getOwnedProject } from '@/lib/projects/ownership';
import { byoDatabases } from '@/lib/db/schema';

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

async function getAuthorizedProject(projectId: string) {
  const session = await auth();
  if (!session?.user?.id) return { response: NextResponse.json({ error: 'Sign in required.' }, { status: 401 }) };
  const project = await getOwnedProject(projectId, session.user.id);
  if (!project) return { response: NextResponse.json({ error: 'Project not found.' }, { status: 404 }) };
  return { session, project };
}

export async function GET(_request: Request, { params }: RouteContext) {
  const { projectId } = await params;
  try {
    const access = await getAuthorizedProject(projectId);
    if ('response' in access) return access.response;
    if (!hasDatabaseConfiguration()) return NextResponse.json({ error: 'Database is unavailable.' }, { status: 503 });

    const [database] = await getDatabase()
      .select({
        provider: byoDatabases.provider,
        neonProjectId: byoDatabases.neonProjectId,
        connectionStringEncrypted: byoDatabases.connectionStringEncrypted,
        neonApiKeyEncrypted: byoDatabases.neonApiKeyEncrypted,
      })
      .from(byoDatabases)
      .where(eq(byoDatabases.projectId, projectId))
      .limit(1);

    return NextResponse.json({
      provider: database?.provider ?? 'netlify',
      ...(database?.neonProjectId ? { neonProjectId: database.neonProjectId } : {}),
      hasConnectionString: Boolean(database?.connectionStringEncrypted),
      hasApiKey: Boolean(database?.neonApiKeyEncrypted),
    });
  } catch {
    return NextResponse.json({ error: 'Database settings are unavailable.' }, { status: 503 });
  }
}

export async function POST(request: Request, { params }: RouteContext) {
  const { projectId } = await params;
  try {
    const access = await getAuthorizedProject(projectId);
    if ('response' in access) return access.response;
    if (!hasDatabaseConfiguration()) return NextResponse.json({ error: 'Database is unavailable.' }, { status: 503 });
    if (Number(request.headers.get('content-length') ?? 0) > 12_000) {
      return NextResponse.json({ error: 'Request is too large.' }, { status: 413 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON request body.' }, { status: 400 });
    }
    if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid database settings.' }, { status: 400 });

    const input = body as Record<string, unknown>;
    if (
      input.provider !== 'neon' ||
      typeof input.connectionString !== 'string' ||
      (input.neonApiKey !== undefined && typeof input.neonApiKey !== 'string') ||
      (input.neonProjectId !== undefined && typeof input.neonProjectId !== 'string') ||
      (input.neonDatabaseName !== undefined && typeof input.neonDatabaseName !== 'string')
    ) {
      return NextResponse.json({ error: 'Provide a Neon connection string and optional Neon project details.' }, { status: 400 });
    }
    if (input.neonApiKey && input.neonApiKey.length > 2_000) {
      return NextResponse.json({ error: 'Neon API key is too long.' }, { status: 400 });
    }

    try {
      await testNeonConnection(input.connectionString);
    } catch {
      return NextResponse.json({ error: 'Unable to connect to Neon. Check the connection details and try again.' }, { status: 400 });
    }

    let connectionStringEncrypted: string;
    let neonApiKeyEncrypted: string | null = null;
    try {
      connectionStringEncrypted = encryptSecret(input.connectionString);
      if (typeof input.neonApiKey === 'string' && input.neonApiKey.trim()) {
        neonApiKeyEncrypted = encryptSecret(input.neonApiKey.trim());
      }
    } catch {
      return NextResponse.json({ error: 'Credential encryption is not configured.' }, { status: 503 });
    }

    if (!neonApiKeyEncrypted) {
      const [existing] = await getDatabase()
        .select({ neonApiKeyEncrypted: byoDatabases.neonApiKeyEncrypted })
        .from(byoDatabases)
        .where(eq(byoDatabases.projectId, projectId))
        .limit(1);
      neonApiKeyEncrypted = existing?.neonApiKeyEncrypted ?? null;
    }

    await getDatabase()
      .insert(byoDatabases)
      .values({
        projectId,
        provider: 'neon',
        connectionStringEncrypted,
        neonApiKeyEncrypted,
        neonProjectId: typeof input.neonProjectId === 'string' ? input.neonProjectId.slice(0, 128) : null,
        neonDatabaseName: typeof input.neonDatabaseName === 'string' ? input.neonDatabaseName.slice(0, 128) : null,
      })
      .onConflictDoUpdate({
        target: byoDatabases.projectId,
        set: {
          provider: 'neon',
          connectionStringEncrypted,
          neonApiKeyEncrypted,
          neonProjectId: typeof input.neonProjectId === 'string' ? input.neonProjectId.slice(0, 128) : null,
          neonDatabaseName: typeof input.neonDatabaseName === 'string' ? input.neonDatabaseName.slice(0, 128) : null,
          updatedAt: new Date(),
        },
      });

    return NextResponse.json({ provider: 'neon', hasConnectionString: true, hasApiKey: Boolean(neonApiKeyEncrypted) });
  } catch {
    return NextResponse.json({ error: 'Database settings could not be saved.' }, { status: 503 });
  }
}

export async function DELETE(_request: Request, { params }: RouteContext) {
  const { projectId } = await params;
  try {
    const access = await getAuthorizedProject(projectId);
    if ('response' in access) return access.response;
    if (!hasDatabaseConfiguration()) return NextResponse.json({ error: 'Database is unavailable.' }, { status: 503 });

    await getDatabase().delete(byoDatabases).where(eq(byoDatabases.projectId, projectId));
    return NextResponse.json({ provider: 'netlify', hasConnectionString: false, hasApiKey: false });
  } catch {
    return NextResponse.json({ error: 'Database could not be disconnected.' }, { status: 503 });
  }
}