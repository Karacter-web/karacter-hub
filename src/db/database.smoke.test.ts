import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { getDatabase, hasDatabaseConfiguration } from './index';
import { authRateLimits } from '@/lib/db/schema';

test('database can insert and read a row', { skip: !hasDatabaseConfiguration() }, async () => {
  const database = getDatabase();
  const key = `smoke-${randomUUID()}`;

  try {
    const [inserted] = await database
      .insert(authRateLimits)
      .values({ key, count: 1, windowStartedAt: new Date() })
      .returning({ key: authRateLimits.key, count: authRateLimits.count });
    const [readBack] = await database
      .select({ key: authRateLimits.key, count: authRateLimits.count })
      .from(authRateLimits)
      .where((await import('drizzle-orm')).eq(authRateLimits.key, key))
      .limit(1);

    assert.equal(inserted.key, key);
    assert.deepEqual(readBack, inserted);
  } finally {
    await database.delete(authRateLimits).where((await import('drizzle-orm')).eq(authRateLimits.key, key));
  }
});