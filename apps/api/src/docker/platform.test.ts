import { describe, expect, it } from 'vitest';
import { hostPlatform, ImagePlatformError, isPlatformMismatch } from './client.js';

describe('hostPlatform', () => {
  it('maps the pi and a laptop to the platform docker expects', async () => {
    const pi = { info: async () => ({ Architecture: 'aarch64', OSType: 'linux' }) };
    const mac = { info: async () => ({ Architecture: 'x86_64', OSType: 'linux' }) };
    expect(await hostPlatform(pi as never)).toBe('linux/arm64');
    expect(await hostPlatform(mac as never)).toBe('linux/amd64');
  });

  it('handles 32 bit pi os and anything unexpected', async () => {
    const old = { info: async () => ({ Architecture: 'armv7l', OSType: 'linux' }) };
    const odd = { info: async () => ({ Architecture: 'riscv64', OSType: 'linux' }) };
    expect(await hostPlatform(old as never)).toBe('linux/arm/v7');
    expect(await hostPlatform(odd as never)).toBe('linux/riscv64');
  });
});

describe('isPlatformMismatch', () => {
  it('recognises the errors docker gives for a missing architecture', () => {
    expect(isPlatformMismatch('no matching manifest for linux/arm64/v8 in the manifest list entries')).toBe(true);
    expect(isPlatformMismatch('image cannot be used on this platform')).toBe(true);
    expect(isPlatformMismatch('no match for platform in manifest')).toBe(true);
  });

  it('does not mistake other failures for it', () => {
    expect(isPlatformMismatch('pull access denied for private/image')).toBe(false);
    expect(isPlatformMismatch('manifest unknown')).toBe(false);
  });
});

describe('ImagePlatformError', () => {
  it('says what is wrong and what to do about it', () => {
    const error = new ImagePlatformError('some/image:1', 'linux/arm64');
    expect(error.message).toContain('some/image:1');
    expect(error.message).toContain('linux/arm64');
    expect(error.message).toMatch(/cannot run on this server/);
  });
});
