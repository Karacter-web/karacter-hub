import assert from 'node:assert/strict';
import test from 'node:test';
import { createNeonClient, NeonApiError } from './client';

test('Neon client uses the API key bearer header for project/database operations', async () => {
  const calls: Array<{ url: string; authorization: string; body?: string }> = [];
  const responses = [
    { projects: [{ id: 'project-1', name: 'app-db', region_id: 'aws-us-east-1' }] },
    { project: { id: 'project-2', name: 'new-db', region_id: 'aws-us-east-1' } },
    { branches: [{ id: 'branch-1', primary: true }] },
    { databases: [{ id: 1, name: 'app', owner_name: 'app_owner' }] },
    { uri: 'postgresql://redacted' },
  ];
  const client = createNeonClient('test-only-token', {
    fetcher: async (input, init) => {
      calls.push({
        url: String(input),
        authorization: new Headers(init?.headers).get('Authorization') ?? '',
        body: typeof init?.body === 'string' ? init.body : undefined,
      });
      return new Response(JSON.stringify(responses.shift()), { status: 200 });
    },
  });

  assert.equal((await client.listProjects())[0].id, 'project-1');
  assert.equal((await client.createProject({ name: 'new-db', region: 'aws-us-east-1' })).id, 'project-2');
  assert.equal((await client.listDatabases('project/1'))[0].name, 'app');
  assert.equal(await client.getConnectionString('project-1', 'app', 'app_owner'), 'postgresql://redacted');
  assert.equal(calls.length, 5);
  assert.ok(calls.every(call => call.authorization === 'Bearer test-only-token'));
  assert.match(calls[2].url, /projects\/project%2F1\/branches$/);
  assert.deepEqual(JSON.parse(calls[1].body ?? '{}'), {
    project: { name: 'new-db', region_id: 'aws-us-east-1' },
  });
  assert.match(calls[4].url, /database_name=app/);
});

test('Neon API errors do not expose response bodies or credentials', async () => {
  const secret = 'test-only-token';
  const client = createNeonClient(secret, {
    fetcher: async () => new Response(`${secret} private response`, { status: 401 }),
  });

  await assert.rejects(client.listProjects(), error => {
    assert.ok(error instanceof NeonApiError);
    assert.equal(error.status, 401);
    assert.equal(error.message.includes(secret), false);
    assert.equal(error.message.includes('private response'), false);
    return true;
  });
});