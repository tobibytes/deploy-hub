import { describe, expect, it } from 'vitest';
import { loadConfig } from './config.js';

import { randomBytes } from 'node:crypto';

const minimal = {
  DATABASE_URL: 'postgresql://rig:rig@localhost:5432/rig',
  SESSION_SECRET: 'x'.repeat(32),
  ENV_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
  OWNER_EMAIL: 'me@example.com',
  BASE_DOMAIN: 'tobipi.dev',
};

describe('loadConfig', () => {
  it('refuses to start without the secrets, and names what is missing', () => {
    expect(() => loadConfig({} as NodeJS.ProcessEnv)).toThrow(/DATABASE_URL/);
    expect(() => loadConfig({ ...minimal, BASE_DOMAIN: '' } as NodeJS.ProcessEnv)).toThrow(/BASE_DOMAIN/);
    expect(() => loadConfig({ ...minimal, SESSION_SECRET: 'short' } as NodeJS.ProcessEnv)).toThrow(
      /SESSION_SECRET/,
    );
    expect(() => loadConfig({ ...minimal, OWNER_EMAIL: 'not-an-email' } as NodeJS.ProcessEnv)).toThrow(
      /OWNER_EMAIL/,
    );
  });

  it('refuses an encryption key that is not exactly 32 bytes', () => {
    // Long enough to look plausible, but only 30 bytes once decoded.
    expect(() =>
      loadConfig({ ...minimal, ENV_ENCRYPTION_KEY: randomBytes(30).toString('base64') } as NodeJS.ProcessEnv),
    ).toThrow(/ENV_ENCRYPTION_KEY/);
    expect(() => loadConfig({ ...minimal, ENV_ENCRYPTION_KEY: 'y'.repeat(44) } as NodeJS.ProcessEnv)).toThrow(
      /ENV_ENCRYPTION_KEY/,
    );
    // Hex is accepted as well as base64.
    expect(() =>
      loadConfig({ ...minimal, ENV_ENCRYPTION_KEY: randomBytes(32).toString('hex') } as NodeJS.ProcessEnv),
    ).not.toThrow();
  });

  it('fills in sensible defaults', () => {
    const cfg = loadConfig(minimal as NodeJS.ProcessEnv);
    expect(cfg.PORT).toBe(3001);
    expect(cfg.BASE_DOMAIN).toBe('tobipi.dev');
    expect(cfg.rigHostname).toBe('rig.tobipi.dev');
    expect(cfg.APPS_NETWORK).toBe('rig_apps');
    expect(cfg.COOKIE_SECURE).toBe(true);
    expect(cfg.RECONCILE_INTERVAL_MS).toBe(30_000);
  });

  it('reserves its own subdomain so an app cannot take over the dashboard', () => {
    const cfg = loadConfig(minimal as NodeJS.ProcessEnv);
    expect(cfg.extraReservedNames).toContain('rig');
  });

  it('reserves the dashboard subdomain even when it is renamed', () => {
    const cfg = loadConfig({ ...minimal, RIG_HOSTNAME: 'panel.tobipi.dev' } as NodeJS.ProcessEnv);
    expect(cfg.extraReservedNames).toContain('panel');
  });

  it('reads the guarded domains, which cannot be attached to an app', () => {
    const cfg = loadConfig({
      ...minimal,
      GUARDED_DOMAINS: 'tobiolajide.com, MadeByTobi.com ,',
    } as NodeJS.ProcessEnv);
    expect(cfg.guardedDomains).toEqual(['tobiolajide.com', 'madebytobi.com']);
  });

  it('reads extra reserved hostnames from a comma separated list', () => {
    const cfg = loadConfig({ ...minimal, EXTRA_RESERVED_NAMES: 'blog, Shop ,' } as NodeJS.ProcessEnv);
    expect(cfg.extraReservedNames).toContain('blog');
    expect(cfg.extraReservedNames).toContain('shop');
    expect(cfg.extraReservedNames).not.toContain('');
  });

  it('allows plain http only when asked explicitly', () => {
    const cfg = loadConfig({ ...minimal, COOKIE_SECURE: 'false' } as NodeJS.ProcessEnv);
    expect(cfg.COOKIE_SECURE).toBe(false);
  });
});
