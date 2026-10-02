import assert from 'node:assert/strict';
import test from 'node:test';
import { assertNeonConnectionString, testNeonConnection, type NeonPoolLike } from './connection';

test('only Neon PostgreSQL hosts are accepted', () => {
  assert.equal(
    assertNeonConnectionString('postgresql://app:secret@ep-example.us-east-2.aws.neon.tech/app?sslmode=require'),
    'postgresql://app:secret@ep-example.us-east-2.aws.neon.tech/app?sslmode=require',
  );
  assert.throws(() => assertNeonConnectionString('postgres://user:password@localhost/app'));
  assert.throws(() => assertNeonConnectionString('https://ep-example.neon.tech'));
});

test('test connection releases the client and closes its pool', async () => {
  let queryCount = 0;
  let releaseCount = 0;
  let endCount = 0;
  const pool: NeonPoolLike = {
    async connect() {
      return {
        async query(text) {
          assert.equal(text, 'select 1');
          queryCount += 1;
        },
        release() { releaseCount += 1; },
      };
    },
    async end() { endCount += 1; },
  };

  await testNeonConnection(
    'postgresql://user:password@ep-example.neon.tech/app?sslmode=require',
    () => pool,
  );
  assert.deepEqual([queryCount, releaseCount, endCount], [1, 1, 1]);
});