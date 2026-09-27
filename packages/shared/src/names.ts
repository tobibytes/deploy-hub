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

/** The public URL an app gets. */
export function appUrl(name: string, domain: string): string {
  return `https://${appHostname(name, domain)}`;
}
