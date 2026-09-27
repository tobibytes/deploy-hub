import { describe, expect, it } from 'vitest';
import { checkMountPath, volumeName } from './names.js';
import { createAppSchema, volumePathSchema } from './schemas.js';

describe('volumeName', () => {
  it('names the volume after the app, so two apps cannot collide', () => {
    expect(volumeName('dj')).toBe('rig-dj-data');
    expect(volumeName('invoices')).toBe('rig-invoices-data');
  });
});

describe('checkMountPath', () => {
  it('accepts an ordinary absolute path', () => {
    expect(checkMountPath('/data').ok).toBe(true);
    expect(checkMountPath('/var/lib/app').ok).toBe(true);
    expect(checkMountPath('/app/uploads').ok).toBe(true);
  });

  it('requires a leading slash', () => {
    expect(checkMountPath('data').ok).toBe(false);
    expect(checkMountPath('./data').ok).toBe(false);
  });

  it('refuses paths that would hide part of the image', () => {
    for (const path of ['/', '/etc', '/usr', '/bin', '/lib', '/proc', '/dev', '/sbin', '/var']) {
      expect(checkMountPath(path).ok, path).toBe(false);
    }
  });

  it('explains why, naming a path that would work', () => {
    const verdict = checkMountPath('/etc');
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toContain('/data');
  });

  it('refuses anything that tries to climb out', () => {
    expect(checkMountPath('/data/../etc').ok).toBe(false);
    expect(checkMountPath('/data//sub').ok).toBe(false);
  });

  it('refuses characters that have no business in a mount path', () => {
    expect(checkMountPath('/data;rm -rf').ok).toBe(false);
    expect(checkMountPath('/data $(x)').ok).toBe(false);
  });

  it('allows a subpath of a forbidden root, which is not the same thing', () => {
    // /var is refused, /var/lib/app is fine: it adds to the image rather than hiding it.
    expect(checkMountPath('/var/lib/app').ok).toBe(true);
  });
});

describe('volumePathSchema', () => {
  it('treats empty and null alike, as no stored data', () => {
    expect(volumePathSchema.parse(null)).toBeNull();
    expect(volumePathSchema.parse('')).toBeNull();
  });

  it('trims a trailing slash so one path has one spelling', () => {
    expect(volumePathSchema.parse('/data/')).toBe('/data');
    expect(volumePathSchema.parse('/data')).toBe('/data');
  });

  it('passes the reason through rather than a validator message', () => {
    const result = volumePathSchema.safeParse('/etc');
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toMatch(/hide part of the image/);
  });

  it('defaults to no volume when an app does not ask for one', () => {
    const app = createAppSchema.parse({ name: 'plain', image: 'nginx', internalPort: 80 });
    expect(app.volumePath).toBeNull();
  });

  it('carries the path through when an app does', () => {
    const app = createAppSchema.parse({ name: 'dj', image: 'x', internalPort: 3000, volumePath: '/data' });
    expect(app.volumePath).toBe('/data');
  });
});
