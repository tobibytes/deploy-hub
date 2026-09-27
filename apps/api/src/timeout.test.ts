import { describe, expect, it } from 'vitest';
import { TimeoutError, withTimeout } from './timeout.js';

describe('withTimeout', () => {
  it('passes a result straight through', async () => {
    await expect(withTimeout('thing', 1000, Promise.resolve(7))).resolves.toBe(7);
  });

  it('gives up on work that never finishes, and names what it was waiting for', async () => {
    const never = new Promise<never>(() => {});
    await expect(withTimeout('Docker', 30, never)).rejects.toThrow(TimeoutError);
    await expect(withTimeout('Docker', 30, never)).rejects.toThrow(/Docker did not answer/);
  });

  it('lets the original failure through rather than masking it', async () => {
    await expect(withTimeout('thing', 1000, Promise.reject(new Error('real problem')))).rejects.toThrow(
      'real problem',
    );
  });
});
