import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;

/**
 * Symmetric encryption helper for at-rest API keys. AES-256-GCM with a
 * 12-byte IV; key is derived as SHA-256(API_KEY_ENCRYPTION_SECRET) so
 * the deployment-time secret can be any reasonable-length string.
 *
 * Combined format (one base64 blob, fields colon-delimited):
 *   <iv>:<authTag>:<ciphertext>
 *
 * Each field is base64. We refuse to silently fall back to a default
 * secret — a misconfigured deploy must fail loudly, not corrupt data.
 */

function getKey(): Buffer {
  const secret = process.env['API_KEY_ENCRYPTION_SECRET'];
  if (!secret) {
    throw new Error(
      'API_KEY_ENCRYPTION_SECRET env var is not set — required to store user API keys at rest.',
    );
  }
  return createHash('sha256').update(secret).digest();
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    iv.toString('base64'),
    tag.toString('base64'),
    ct.toString('base64'),
  ].join(':');
}

export function decrypt(combined: string): string {
  const parts = combined.split(':');
  if (parts.length !== 3) {
    throw new Error('Malformed ciphertext (expected iv:tag:ct)');
  }
  const [ivB64, tagB64, ctB64] = parts;
  const iv = Buffer.from(ivB64, 'base64');
  const tag = Buffer.from(tagB64, 'base64');
  const ct = Buffer.from(ctB64, 'base64');
  const decipher = createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}
