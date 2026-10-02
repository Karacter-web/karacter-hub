import assert from 'node:assert/strict';
import test from 'node:test';
import { redactSecretValues, removeSecretFilesFromContext } from './redact';

test('redacts common credentials and connection strings but preserves env var names', () => {
  const input = 'OPENAI_API_KEY=sk-proj-secret-value DATABASE_URL=postgresql://app:secret@db.neon.tech/app';
  const output = redactSecretValues(input);
  assert.match(output, /OPENAI_API_KEY=\[REDACTED\]/);
  assert.match(output, /DATABASE_URL=\[REDACTED\]/);
  assert.equal(output.includes('sk-proj-secret-value'), false);
  assert.equal(output.includes('postgresql://app:secret'), false);
});

test('removes dotenv files from model context and redacts inline bearer values', () => {
  const files = removeSecretFilesFromContext([
    { path: '.env.local', content: 'MISTRAL_API_KEY=secret' },
    { path: 'src/api.ts', content: 'Authorization: Bearer abcdefghijklmnopqrstuvwxyz123456' },
  ]);
  assert.equal(files.length, 1);
  assert.equal(files[0].content.includes('abcdefghijklmnopqrstuvwxyz'), false);
  assert.equal(files[0].content, 'Authorization: Bearer [REDACTED]');
});