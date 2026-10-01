import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { getDatabase } from '@/lib/db';
import { users } from '@/lib/db/schema';

const USERNAME_PATTERN = /^[a-z0-9_]{3,32}$/;

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body.' }, { status: 400 });
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid profile details.' }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const username = typeof input.username === 'string' ? input.username.trim().toLowerCase() : '';
  if (!name || name.length > 80 || !USERNAME_PATTERN.test(username)) {
    return NextResponse.json({ error: 'Enter a display name and a valid username.' }, { status: 400 });
  }

  try {
    const [user] = await getDatabase()
      .update(users)
      .set({ name, username })
      .where(eq(users.id, session.user.id))
      .returning({ name: users.name, username: users.username });

    if (!user) return NextResponse.json({ error: 'Account not found.' }, { status: 404 });
    return NextResponse.json({ user });
  } catch (error) {
    const databaseError = error as { code?: string; cause?: { code?: string } };
    if (databaseError.code === '23505' || databaseError.cause?.code === '23505') {
      return NextResponse.json({ error: 'That username is already in use.' }, { status: 409 });
    }
    console.error('Profile update failed:', error);
    return NextResponse.json({ error: 'Profile could not be updated.' }, { status: 503 });
  }
}