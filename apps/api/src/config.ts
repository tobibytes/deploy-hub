import { z } from 'zod';

/**
 * Every setting Rig needs, validated once at startup. If something required is
 * missing the process exits with a message naming it, rather than starting in a
 * half-configured state.
 */
/** Checked here so a bad key is reported with every other setting, not later. */
function isThirtyTwoBytes(raw: string): boolean {
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return true;
  try {
    return Buffer.from(raw, 'base64').length === 32;
  } catch {
    return false;
  }
}

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  HOST: z.string().default('0.0.0.0'),

  /**
   * Apps get `<name>.<BASE_DOMAIN>`. Required, with no default: a default would
   * be a hard-coded domain, and the guide is explicit that the domain appears
   * only in docs and tests.
   */
  BASE_DOMAIN: z
    .string()
    .min(3, 'BASE_DOMAIN is required, for example tobipi.dev.')
    .regex(/^[a-z0-9.-]+$/, 'BASE_DOMAIN must be a hostname, in lowercase.'),
  /** The dashboard's own hostname, so it is never handed out as an app name. */
  RIG_HOSTNAME: z.string().min(3).optional(),
  /** Extra hostnames already used on the domain, comma separated. */
  EXTRA_RESERVED_NAMES: z.string().default(''),
  /**
   * Domains Rig refuses to attach to an app, because they are already something
   * else of Tobi's. Comma separated.
   */
  GUARDED_DOMAINS: z.string().default(''),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required.'),

  /** Signs and salts session tokens. At least 32 characters. */
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters.'),
  SESSION_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  /** Set to false only when serving the dashboard over plain http. */
  COOKIE_SECURE: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),

  /** 32 bytes of base64 or hex, used to encrypt app environment values at rest. */
  ENV_ENCRYPTION_KEY: z
    .string()
    .refine(isThirtyTwoBytes, 'ENV_ENCRYPTION_KEY must be exactly 32 bytes. Generate one with: openssl rand -base64 32'),

  /**
   * Whether strangers may create their own account. Off unless asked for: an
   * account here is the right to run containers on this machine.
   */
  SIGNUP_ENABLED: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  /** How many apps one member may have at a time. The owner is not limited. */
  MEMBER_APP_QUOTA: z.coerce.number().int().min(0).max(100).default(3),
  /** The most a member may give a single app. The owner may go to the maximum. */
  MEMBER_MAX_MEMORY_MB: z.coerce.number().int().min(64).max(1024).default(256),
  MEMBER_MAX_CPU: z.coerce.number().min(0.1).max(2).default(0.5),

  /** Owner account. Created on first boot when OWNER_PASSWORD is also set. */
  OWNER_EMAIL: z.string().includes('@', { message: 'OWNER_EMAIL must be an email address.' }),
  OWNER_PASSWORD: z.string().min(10).optional(),

  /**
   * How Rig reaches Docker. In Compose this is the socket proxy, so Rig never
   * holds the raw socket. Locally it can be the socket itself.
   */
  DOCKER_HOST_URL: z.string().default(''),
  DOCKER_SOCKET_PATH: z.string().default('/var/run/docker.sock'),

  /** Docker network that Traefik shares with every app. */
  APPS_NETWORK: z.string().default('rig_apps'),
  /** Traefik entrypoint name that app routers attach to. */
  TRAEFIK_ENTRYPOINT: z.string().default('web'),
  /** Traefik's own service name, used by the health check. */
  TRAEFIK_PING_URL: z.string().default(''),
  /**
   * Traefik's Prometheus endpoint. Rig reads per-app request counts from it, so
   * traffic figures need nothing added to the apps. Empty turns the feature off
   * and the dashboard says so rather than showing zeroes.
   */
  TRAEFIK_METRICS_URL: z.string().default(''),

  /** Where the built dashboard lives. Empty means do not serve static files. */
  WEB_DIST: z.string().default(''),

  RECONCILE_INTERVAL_MS: z.coerce.number().int().min(5_000).max(600_000).default(30_000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export type Config = Omit<z.infer<typeof schema>, 'EXTRA_RESERVED_NAMES' | 'GUARDED_DOMAINS'> & {
  extraReservedNames: string[];
  guardedDomains: string[];
  rigHostname: string;
  version: string;
};

let cached: Config | null = null;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join('.') || '(root)'}: ${i.message}`);
    throw new Error(`Rig cannot start. Fix these settings in deploy/.env:\n${lines.join('\n')}`);
  }
  const v = parsed.data;
  const rigHostname = v.RIG_HOSTNAME ?? `rig.${v.BASE_DOMAIN}`;
  const extra = v.EXTRA_RESERVED_NAMES.split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  // The dashboard's own subdomain can never be an app name.
  const rigLabel = rigHostname.endsWith(`.${v.BASE_DOMAIN}`)
    ? rigHostname.slice(0, -(v.BASE_DOMAIN.length + 1))
    : rigHostname;
  if (rigLabel && !extra.includes(rigLabel)) extra.push(rigLabel);

  const guarded = v.GUARDED_DOMAINS.split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const { EXTRA_RESERVED_NAMES: _drop, GUARDED_DOMAINS: _drop2, ...rest } = v;
  return {
    ...rest,
    extraReservedNames: extra,
    guardedDomains: guarded,
    rigHostname,
    version: process.env.RIG_VERSION ?? 'dev',
  };
}

export function config(): Config {
  cached ??= loadConfig();
  return cached;
}
