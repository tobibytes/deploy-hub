/**
 * An app's name becomes its subdomain, so it has to be a valid DNS label and it
 * must not collide with a hostname the domain already uses.
 */

export const NAME_MIN = 2;
export const NAME_MAX = 32;

/** Hostnames that already exist on the domain, or that Rig keeps for itself. */
export const RESERVED_NAMES = [
  'admin',
  'api',
  'assets',
  'cdn',
  'cloudflared',
  'db',
  'dev',
  'ftp',
  'imap',
  'localhost',
  'mail',
  'ns1',
  'ns2',
  'postgres',
  'rig',
  'root',
  'smtp',
  'staging',
  'status',
  'static',
  'test',
  'traefik',
  'www',
] as const;

// Must start with a letter, per the hosting guide.
const LABEL = /^[a-z](?:[a-z0-9-]*[a-z0-9])?$/;

export type NameProblem =
  | { ok: true }
  | { ok: false; reason: string };

/**
 * Checks a candidate app name. `extraReserved` lets the server add names that
 * are only reserved on a particular deployment (for example other DNS records).
 */
export function checkAppName(raw: string, extraReserved: readonly string[] = []): NameProblem {
  const name = raw.trim();

  if (name.length === 0) return { ok: false, reason: 'Pick a name for the app.' };
  if (name !== raw) return { ok: false, reason: 'Names cannot start or end with a space.' };
  if (name !== name.toLowerCase()) return { ok: false, reason: 'Use lowercase letters only.' };
  if (name.length < NAME_MIN) return { ok: false, reason: `Use at least ${NAME_MIN} characters.` };
  if (name.length > NAME_MAX) return { ok: false, reason: `Use at most ${NAME_MAX} characters.` };
  if (!LABEL.test(name)) {
    return {
      ok: false,
      reason: 'Start with a letter, then lowercase letters, numbers and single hyphens.',
    };
  }
  if (name.includes('--')) return { ok: false, reason: 'Use one hyphen at a time, not two in a row.' };

  const reserved = new Set<string>([...RESERVED_NAMES, ...extraReserved.map((n) => n.toLowerCase())]);
  if (reserved.has(name)) return { ok: false, reason: `"${name}" is already used by this domain. Pick another name.` };

  return { ok: true };
}

/** The public hostname an app gets. */
export function appHostname(name: string, domain: string): string {
  return `${name}.${domain}`;
}

/** The named volume an app's data lives in, when it asks for one. */
export function volumeName(appName: string): string {
  return `rig-${appName}-data`;
}

/**
 * Where a volume may be mounted. Absolute, and away from the paths that make a
 * container work: shadowing /etc or /usr with an empty volume breaks the image
 * in ways that are hard to read from a log.
 */
const FORBIDDEN_MOUNTS = [
  '/',
  '/bin',
  '/boot',
  '/dev',
  '/etc',
  '/lib',
  '/lib64',
  '/proc',
  '/root',
  '/run',
  '/sbin',
  '/sys',
  '/usr',
  '/var',
];

export function checkMountPath(raw: string): NameProblem {
  const path = raw.trim();
  if (path.length === 0) return { ok: false, reason: 'Give a path to mount the data at, for example /data.' };
  if (!path.startsWith('/')) return { ok: false, reason: 'The path must start with a slash, for example /data.' };
  if (path.length > 255) return { ok: false, reason: 'That path is too long.' };
  if (path.includes('..')) return { ok: false, reason: 'The path cannot contain two dots.' };
  if (/\/\//.test(path)) return { ok: false, reason: 'The path cannot contain two slashes in a row.' };
  if (!/^[A-Za-z0-9/._-]+$/.test(path)) {
    return { ok: false, reason: 'Use letters, numbers, slashes, dots, dashes and underscores.' };
  }

  const tidy = path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path;
  if (FORBIDDEN_MOUNTS.includes(tidy)) {
    return {
      ok: false,
      reason: `Mounting at ${tidy} would hide part of the image and stop it working. Try /data.`,
    };
  }
  return { ok: true };
}

/** The public URL an app gets. */
export function appUrl(name: string, domain: string): string {
  return `https://${appHostname(name, domain)}`;
}
