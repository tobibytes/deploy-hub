import { describe, expect, it } from 'vitest';
import { randomBytes } from 'node:crypto';
import { decryptJson, encryptJson, hashPassword, readKey, sessionDigest, verifyPassword } from './crypto.js';

describe('passwords', () => {
  it('accepts the right password and rejects the wrong one', async () => {
    const hash = await hashPassword('correct horse battery');
    expect(await verifyPassword('correct horse battery', hash)).toBe(true);
    expect(await verifyPassword('correct horse batter', hash)).toBe(false);
  });

  it('salts, so the same password hashes differently each time', async () => {
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'));
  });

  it('does not throw on a damaged hash', async () => {
    expect(await verifyPassword('x', 'nonsense')).toBe(false);
    expect(await verifyPassword('x', '')).toBe(false);
  });

  it('treats the same characters written differently as the same password', async () => {
    // "é" composed versus decomposed, which phone keyboards can produce either way.
    const hash = await hashPassword('café-password');
    expect(await verifyPassword('café-password', hash)).toBe(true);
  });
});

describe('session digests', () => {
  it('changes with the secret, so rotating it invalidates old cookies', () => {
    expect(sessionDigest('token', 'secret-a')).not.toBe(sessionDigest('token', 'secret-b'));
  });

  it('is stable for the same token and secret', () => {
    expect(sessionDigest('token', 's')).toBe(sessionDigest('token', 's'));
  });
});

describe('environment encryption', () => {
  const key = randomBytes(32);

  it('round trips a map of values', () => {
    const env = { DATABASE_URL: 'postgres://x', TOKEN: 'sh!!' };
    expect(decryptJson(encryptJson(env, key), key, {})).toEqual(env);
  });

  it('produces different output each time for the same input', () => {
    expect(encryptJson({ A: '1' }, key)).not.toBe(encryptJson({ A: '1' }, key));
  });

  it('falls back instead of throwing when the key is wrong', () => {
    const blob = encryptJson({ A: '1' }, key);
    expect(decryptJson(blob, randomBytes(32), { fallback: true })).toEqual({ fallback: true });
  });

  it('falls back when the blob has been tampered with', () => {
    const blob = encryptJson({ A: '1' }, key);
    const parts = blob.split('.');
    parts[2] = Buffer.from('tampered').toString('base64url');
    expect(decryptJson(parts.join('.'), key, null)).toBeNull();
  });

  it('reads a key given as hex or base64 and rejects a short one', () => {
    expect(readKey(randomBytes(32).toString('hex')).length).toBe(32);
    expect(readKey(randomBytes(32).toString('base64')).length).toBe(32);
    expect(() => readKey('too-short')).toThrow(/32 bytes/);
  });
});
