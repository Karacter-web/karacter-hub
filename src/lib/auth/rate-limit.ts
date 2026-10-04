import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { getDatabase } from '@/lib/db';
import { authRateLimits } from '@/lib/db/schema';

export function getClientAddress(headers: Headers) {
  return headers.get('x-real-ip')
    || headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || 'unknown';
}

export async function consumeRateLimit(key: string, limit: number, windowMs: number) {
  const now = new Date();
  const cutoff = new Date(now.getTime() - windowMs);
  const hashedKey = createHash('sha256').update(key).digest('hex');
  const [entry] = await getDatabase()
    .insert(authRateLimits)
    .values({ key: hashedKey, count: 1, windowStartedAt: now })
    .onConflictDoUpdate({
      target: authRateLimits.key,
      set: {
        count: sql`CASE WHEN ${authRateLimits.windowStartedAt} <= ${cutoff} THEN 1 ELSE ${authRateLimits.count} + 1 END`,
        windowStartedAt: sql`CASE WHEN ${authRateLimits.windowStartedAt} <= ${cutoff} THEN ${now} ELSE ${authRateLimits.windowStartedAt} END`,
      },
    })
    .returning({ count: authRateLimits.count, windowStartedAt: authRateLimits.windowStartedAt });

  const retryAfter = Math.max(
    1,
    Math.ceil((entry.windowStartedAt.getTime() + windowMs - now.getTime()) / 1000),
  );

  return { allowed: entry.count <= limit, retryAfter };
}