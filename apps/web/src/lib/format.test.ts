import { describe, expect, it } from 'vitest';
import { bytes, withTime } from './format.js';

describe('bytes', () => {
  it('reads at a sensible scale', () => {
    expect(bytes(0)).toBe('0 MB');
    expect(bytes(500 * 1024)).toBe('500 KB');
    expect(bytes(5.5 * 1024 * 1024)).toBe('5.5 MB');
    expect(bytes(300 * 1024 * 1024)).toBe('300 MB');
    expect(bytes(2.5 * 1024 * 1024 * 1024)).toBe('2.5 GB');
  });
});

describe('withTime', () => {
  const iso = '2026-01-02T03:04:05.000Z';

  it('does not end up with two full stops', () => {
    expect(withTime('Docker did not answer.', iso)).not.toMatch(/\.\./);
    expect(withTime('Docker did not answer.', iso)).toMatch(/^Docker did not answer\. /);
  });

  it('adds the missing full stop', () => {
    expect(withTime('Started', iso)).toMatch(/^Started\. /);
  });

  it('falls back to just the time when there is no message', () => {
    expect(withTime(null, iso)).not.toMatch(/\. /);
  });
});
