import { createHash, randomBytes } from 'node:crypto';
import { and, eq, gt } from 'drizzle-orm';
import { cookies } from 'next/headers';
import type { NextResponse } from 'next/server';
import { getDatabase } from './index';
import { browserSessions } from './schema';

const COOKIE_NAME = 'karacter_browser_session';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

export async function getBrowserSession() {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return null;

  const [session] = await getDatabase()
    .select({ id: browserSessions.id })
    .from(browserSessions)
    .where(and(
      eq(browserSessions.tokenHash, hashToken(token)),
      gt(browserSessions.expiresAt, new Date()),
    ))
    .limit(1);

  return session ?? null;
}

export async function getOrCreateBrowserSession() {
  const existing = await getBrowserSession();
  if (existing) return { ...existing, token: null as string | null };

  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  const [session] = await getDatabase()
    .insert(browserSessions)
    .values({ tokenHash: hashToken(token), expiresAt })
    .returning({ id: browserSessions.id });

  return { ...session, token };
}

export function setBrowserSessionCookie(
  response: NextResponse,
  token: string | null,
) {
  if (!token) return response;

  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
  return response;
}