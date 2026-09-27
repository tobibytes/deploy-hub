import { describe, expect, it } from 'vitest';
import { appHostname, appUrl, checkAppName } from './names.js';

describe('checkAppName', () => {
  it('accepts a plain name', () => {
    expect(checkAppName('hello')).toEqual({ ok: true });
    expect(checkAppName('my-app-2')).toEqual({ ok: true });
  });

  it('accepts two characters, and rejects one or more than 32', () => {
    expect(checkAppName('dj').ok).toBe(true);
    expect(checkAppName('a').ok).toBe(false);
    expect(checkAppName('a'.repeat(33)).ok).toBe(false);
  });

  it('requires a leading letter, so a name is always a usable hostname', () => {
    expect(checkAppName('2fa').ok).toBe(false);
    expect(checkAppName('app2').ok).toBe(true);
  });

  it('does not reserve dj, which is a real app', () => {
    expect(checkAppName('dj').ok).toBe(true);
  });

  it('rejects uppercase, spaces and symbols', () => {
    expect(checkAppName('Hello').ok).toBe(false);
    expect(checkAppName(' hello').ok).toBe(false);
    expect(checkAppName('hello world').ok).toBe(false);
    expect(checkAppName('hello_world').ok).toBe(false);
    expect(checkAppName('hello.world').ok).toBe(false);
  });

  it('rejects leading and trailing hyphens and double hyphens', () => {
    expect(checkAppName('-hello').ok).toBe(false);
    expect(checkAppName('hello-').ok).toBe(false);
    expect(checkAppName('he--llo').ok).toBe(false);
  });

  it('rejects reserved hostnames', () => {
    for (const name of ['www', 'rig', 'api', 'mail', 'status', 'admin', 'traefik']) {
      expect(checkAppName(name).ok, name).toBe(false);
    }
  });

  it('rejects extra names the server reserves', () => {
    expect(checkAppName('blog', ['blog']).ok).toBe(false);
    expect(checkAppName('blog', ['BLOG']).ok).toBe(false);
    expect(checkAppName('blog').ok).toBe(true);
  });

  it('explains the problem in plain words', () => {
    const result = checkAppName('WWW');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/lowercase/i);
  });
});

describe('hostnames', () => {
  it('builds the hostname and url from the domain', () => {
    expect(appHostname('hello', 'tobipi.dev')).toBe('hello.tobipi.dev');
    expect(appUrl('hello', 'tobipi.dev')).toBe('https://hello.tobipi.dev');
  });
});
