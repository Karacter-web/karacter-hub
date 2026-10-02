import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const ENVELOPE_VERSION = 'v1';

function getEncryptionKey() {
  const encoded = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!encoded) throw new Error('CREDENTIAL_ENCRYPTION_KEY is required to encrypt stored credentials.');

  const key = Buffer.from(encoded, 'base64');
  if (key.byteLength !== 32) {
    throw new Error('CREDENTIAL_ENCRYPTION_KEY must be a base64-encoded 32-byte key.');
  }
  return key;
}

export function encryptCredential(plaintext: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [ENVELOPE_VERSION, iv.toString('base64url'), tag.toString('base64url'), ciphertext.toString('base64url')].join('.');
}

export function decryptCredential(envelope: string) {
  const [version, encodedIv, encodedTag, encodedCiphertext, extra] = envelope.split('.');
  if (version !== ENVELOPE_VERSION || !encodedIv || !encodedTag || encodedCiphertext === undefined || extra) {
    throw new Error('Stored credential has an invalid encryption envelope.');
  }

  const decipher = createDecipheriv(ALGORITHM, getEncryptionKey(), Buffer.from(encodedIv, 'base64url'));
  decipher.setAuthTag(Buffer.from(encodedTag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(encodedCiphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

export const encryptSecret = encryptCredential;
export const decryptSecret = decryptCredential;