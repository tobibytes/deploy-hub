import { describe, expect, it } from 'vitest';
import { cpuSchema, memorySchema, portSchema } from './schemas.js';

/** Messages reach the dashboard and any other program calling the API, so they
    have to read as sentences rather than as validator output. */
function reason(result: { success: boolean; error?: { issues: { message: string }[] } }): string {
  return result.error?.issues[0]?.message ?? '';
}

describe('limit messages', () => {
  it('says what the memory bounds are, in words', () => {
    expect(reason(memorySchema.safeParse(4096))).toBe('The most an app can have is 1024 MB.');
    expect(reason(memorySchema.safeParse(16))).toBe('Give the app at least 64 MB.');
    expect(reason(memorySchema.safeParse(256.5))).toMatch(/whole number/);
  });

  it('says what the cpu bounds are', () => {
    expect(reason(cpuSchema.safeParse(8))).toBe('The most an app can have is 2 cores.');
    expect(reason(cpuSchema.safeParse(0))).toMatch(/at least/);
  });

  it('says what a valid port is', () => {
    expect(reason(portSchema.safeParse(0))).toBe('The port must be between 1 and 65535.');
    expect(reason(portSchema.safeParse(99999))).toBe('The port must be between 1 and 65535.');
  });

  it('still accepts the ordinary values', () => {
    expect(memorySchema.safeParse(256).success).toBe(true);
    expect(cpuSchema.safeParse(0.5).success).toBe(true);
    expect(portSchema.safeParse(8080).success).toBe(true);
  });
});
