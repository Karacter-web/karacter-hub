import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import test from 'node:test';
import { decryptCredential, encryptCredential } from './crypto';

test('encrypts and decrypts credentials with an authenticated envelope', () => {
  const previousKey = process.env.CREDENTIAL_ENCRYPTION_KEY;
  process.env.CREDENTIAL_ENCRYPTION_KEY = randomBytes(32).toString('base64');

  try {
    const secret = 'provider-token-that-must-not-be-logged';
    const encrypted = encryptCredential(secret);
    assert.notEqual(encrypted, secret);
    assert.equal(decryptCredential(encrypted), secret);
    assert.throws(() => decryptCredential(`${encrypted.slice(0, -1)}x`));
  } finally {
    if (previousKey === undefined) delete process.env.CREDENTIAL_ENCRYPTION_KEY;
    else process.env.CREDENTIAL_ENCRYPTION_KEY = previousKey;
  }
});