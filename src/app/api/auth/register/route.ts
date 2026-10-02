import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getDatabase } from '@/lib/db';
import { hasDatabaseConfiguration } from '@/db';
import { consumeRateLimit, getClientAddress } from '@/lib/auth/rate-limit';
import { users } from '@/lib/db/schema';

const USERNAME_PATTERN = /^[a-z0-9_]{3,32}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_PASSWORD_BYTES = 72;

export async function POST(request: Request) {
  if (!hasDatabaseConfiguration() || !process.env.AUTH_RESEND_KEY || !process.env.AUTH_EMAIL_FROM) {
    return NextResponse.json(
      { error: 'Password sign-up requires Neon and email verification configuration.' },
      { status: 503 },
    );
  }

  if (Number(request.headers.get('content-length') ?? 0) > 8_192) {
    return NextResponse.json({ error: 'Request is too large.' }, { status: 413 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON request body.' }, { status: 400 });
  }

  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid account details.' }, { status: 400 });
  }

  const input = body as Record<string, unknown>;
  const username = typeof input.username === 'string' ? input.username.trim().toLowerCase() : '';
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  const password = typeof input.password === 'string' ? input.password : '';

  if (
    !USERNAME_PATTERN.test(username) ||
    email.length > 254 ||
    !EMAIL_PATTERN.test(email) ||
    password.length < 12 ||
    Buffer.byteLength(password, 'utf8') > MAX_PASSWORD_BYTES
  ) {
    return NextResponse.json(
      { error: 'Use a valid email, a 3-32 character username, and a 12-72 byte password.' },
      { status: 400 },
    );
  }

  try {
    const address = getClientAddress(request.headers);
    const limit = await consumeRateLimit(`register:${address}`, 5, 60 * 60 * 1000);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: 'Too many account creation attempts. Try again later.' },
        { status: 429, headers: { 'Retry-After': String(limit.retryAfter) } },
      );
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const [user] = await getDatabase()
      .insert(users)
      .values({ id: randomUUID(), username, email, name: username, passwordHash })
      .returning({ id: users.id });

    return NextResponse.json({ userId: user.id }, { status: 201 });
  } catch (error) {
    const databaseError = error as { code?: string; cause?: { code?: string } };
    if (databaseError.code === '23505' || databaseError.cause?.code === '23505') {
      return NextResponse.json(
        { error: 'An account could not be created with those details.' },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: 'Account registration is unavailable.' }, { status: 503 });
  }
}