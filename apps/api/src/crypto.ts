import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scrypt as scryptCb,
  timingSafeEqual,
  createHash,
} from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
) => Promise<Buffer>;

/* ---------------------------------------------------------------- passwords */

// scrypt is in Node's standard library, so there is no native module to compile
// for arm64. These parameters take roughly 100ms on a Pi 5.
const SCRYPT_KEYLEN = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize('NFKC'), salt, SCRYPT_KEYLEN);
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltB64, keyB64] = stored.split('$');
  if (scheme !== 'scrypt' || !saltB64 || !keyB64) return false;
  const expected = Buffer.from(keyB64, 'base64');
  const actual = await scrypt(password.normalize('NFKC'), Buffer.from(saltB64, 'base64'), expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/* ---------------------------------------------------------------- sessions */

/** A session token the browser keeps, plus the digest stored in the database. */
export function newSessionToken(): { token: string; digest: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, digest: sessionDigest(token) };
}

export function sessionDigest(token: string, secret = process.env.SESSION_SECRET ?? ''): string {
  return createHash('sha256').update(`${secret}:${token}`).digest('hex');
}

/* ------------------------------------------------------- env var encryption */

/** Reads a 32 byte key given as hex or base64 and fails loudly if it is short. */
export function readKey(raw: string): Buffer {
  const hex = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, 'hex') : null;
  const key = hex ?? Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error(
      'ENV_ENCRYPTION_KEY must be exactly 32 bytes. Generate one with: openssl rand -base64 32',
    );
  }
  return key;
}

/**
 * AES-256-GCM. The output carries its own nonce and tag, so a value can be
 * decrypted with nothing but the key.
 */
export function encryptJson(value: unknown, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  return `v1.${iv.toString('base64url')}.${body.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}`;
}

export function decryptJson<T>(blob: string, key: Buffer, fallback: T): T {
  try {
    const [version, ivB64, bodyB64, tagB64] = blob.split('.');
    if (version !== 'v1' || !ivB64 || !bodyB64 || !tagB64) return fallback;
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
    const plain = Buffer.concat([decipher.update(Buffer.from(bodyB64, 'base64url')), decipher.final()]);
    return JSON.parse(plain.toString('utf8')) as T;
  } catch {
    // A wrong or rotated key should not take the dashboard down.
    return fallback;
  }
}
