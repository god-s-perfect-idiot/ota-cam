import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { config } from '../config.js';

const ALGO = 'aes-256-gcm';
const IV_BYTES = 12;

function key(): Buffer {
  return Buffer.from(config.ENCRYPTION_KEY, 'hex');
}

/**
 * Encrypts a secret for storage at rest. Output is `iv.ciphertext.tag`, all
 * base64url, so a leaked data file alone does not surrender the refresh token.
 */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, ciphertext, tag].map((b) => b.toString('base64url')).join('.');
}

export function decryptSecret(payload: string): string {
  const parts = payload.split('.');
  if (parts.length !== 3) throw new Error('Malformed encrypted payload');
  const [iv, ciphertext, tag] = parts.map((p) => Buffer.from(p, 'base64url'));
  const decipher = createDecipheriv(ALGO, key(), iv!);
  decipher.setAuthTag(tag!);
  return Buffer.concat([decipher.update(ciphertext!), decipher.final()]).toString('utf8');
}

/** Constant-time string comparison that tolerates differing lengths. */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHmac('sha256', config.SESSION_SECRET).update(a).digest();
  const hb = createHmac('sha256', config.SESSION_SECRET).update(b).digest();
  return timingSafeEqual(ha, hb);
}

/** Signs a session payload as `value.signature`. */
export function signValue(value: string): string {
  const sig = createHmac('sha256', config.SESSION_SECRET).update(value).digest('base64url');
  return `${value}.${sig}`;
}

export function verifySignedValue(signed: string): string | null {
  const idx = signed.lastIndexOf('.');
  if (idx <= 0) return null;
  const value = signed.slice(0, idx);
  const expected = signValue(value);
  return safeEqual(signed, expected) ? value : null;
}

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no I/L/O/0/1, easier to read aloud

/**
 * Roll codes appear in a shareable URL, so they must be unguessable. 10 chars
 * of this alphabet is ~49 bits of entropy.
 */
export function generateRollCode(length = 10): string {
  // Rejection sampling keeps the distribution uniform across the alphabet.
  const limit = 256 - (256 % CODE_ALPHABET.length);
  let out = '';
  while (out.length < length) {
    for (const byte of randomBytes((length - out.length) * 2)) {
      if (byte >= limit) continue;
      out += CODE_ALPHABET[byte % CODE_ALPHABET.length];
      if (out.length === length) break;
    }
  }
  return out;
}

export function isValidRollCode(code: string): boolean {
  return code.length >= 6 && code.length <= 16 && [...code].every((c) => CODE_ALPHABET.includes(c));
}

export function randomId(): string {
  return randomBytes(16).toString('hex');
}
