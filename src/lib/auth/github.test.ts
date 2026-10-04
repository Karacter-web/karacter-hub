import assert from 'node:assert/strict';
import test from 'node:test';
import { hasVerifiedOAuthEmail } from './github';

test('account-linking guard accepts only verified OAuth profiles with an email', () => {
  assert.equal(hasVerifiedOAuthEmail({ email: 'user@example.test', email_verified: true }), true);
  assert.equal(hasVerifiedOAuthEmail({ email: 'user@example.test', emailVerified: true }), true);
  assert.equal(hasVerifiedOAuthEmail({ email: 'user@example.test', emailVerified: new Date() }), true);
  assert.equal(hasVerifiedOAuthEmail({ email: 'user@example.test', email_verified: false }), false);
  assert.equal(hasVerifiedOAuthEmail({ email: null, email_verified: true }), false);
  assert.equal(hasVerifiedOAuthEmail(null), false);
});
