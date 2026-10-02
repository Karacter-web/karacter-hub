import assert from 'node:assert/strict';
import test from 'node:test';
import { applyProjectMigrations, type MigrationClient } from './migrations';

class MemoryMigrationClient implements MigrationClient {
  rows: Array<{ name: string; hash: string }> = [];
  executed: string[] = [];
  private snapshot: { rows: Array<{ name: string; hash: string }>; executed: string[] } | null = null;

  async query<T extends Record<string, unknown>>(text: string, values: unknown[] = []) {
    if (text === 'BEGIN') this.snapshot = { rows: [...this.rows], executed: [...this.executed] };
    if (text === 'ROLLBACK' && this.snapshot) {
      this.rows = this.snapshot.rows;
      this.executed = this.snapshot.executed;
      this.snapshot = null;
      return { rows: [] as T[] };
    }
    if (text === 'COMMIT') this.snapshot = null;
    if (text.startsWith('SELECT name, hash FROM schema_migrations')) {
      return { rows: this.rows as unknown as T[] };
    }
    if (text.startsWith('INSERT INTO schema_migrations')) {
      this.rows.push({ name: String(values[1]), hash: String(values[2]) });
      return { rows: [] as T[] };
    }
    if (text === 'FAIL') throw new Error('database error includes connection details');
    this.executed.push(text);
    return { rows: [] as T[] };
  }
}

test('project migrations apply once and subsequent runs are skipped by hash', async () => {
  const client = new MemoryMigrationClient();
  const migrations = [{ name: '0001_init.sql', sql: 'CREATE TABLE example (id int);--> statement-breakpoint\nCREATE INDEX example_id ON example(id);' }];
  const first = await applyProjectMigrations(client, 'project-uuid', migrations);
  const executionsAfterFirst = client.executed.filter(statement => statement.includes('example')).length;
  const second = await applyProjectMigrations(client, 'project-uuid', migrations);

  assert.deepEqual(first.applied, ['0001_init.sql']);
  assert.deepEqual(first.skipped, []);
  assert.deepEqual(second.applied, []);
  assert.deepEqual(second.skipped, ['0001_init.sql']);
  assert.equal(client.executed.filter(statement => statement.includes('example')).length, executionsAfterFirst);
});

test('a failed statement rolls back the entire migration transaction', async () => {
  const client = new MemoryMigrationClient();
  await assert.rejects(
    applyProjectMigrations(client, 'project-uuid', [{ name: '0001_fail.sql', sql: 'CREATE TABLE partial (id int);--> statement-breakpoint\nFAIL' }]),
    error => {
      assert.ok(error instanceof Error);
      assert.ok('statementIndex' in error);
      assert.equal(error.statementIndex, 2);
      assert.equal(error.message, 'The external database rejected the schema migration.');
      return true;
    },
  );
  assert.deepEqual(client.executed, []);
  assert.deepEqual(client.rows, []);
});