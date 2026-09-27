/**
 * Exercises the real Fastify app against a real Postgres, with Docker replaced by
 * a stub. This is where the security rules are pinned down: no route outside
 * health and login may answer without a session, and no one may touch an app that
 * is not theirs.
 *
 * Runs only when a throwaway database is offered:
 *   RIG_TEST_DATABASE_URL=postgresql://rig:rig@127.0.0.1:5433/rig pnpm --filter @rig/api test
 * `scripts/infra.sh up` starts a suitable one, and CI sets it too.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { randomBytes } from 'node:crypto';
import { Client } from 'pg';
import { sql } from 'drizzle-orm';
import { loadConfig, type Config } from './config.js';
import { createDb, runMigrations, waitForDatabase, schema, type Db } from './db/index.js';
import { AppsService } from './apps-service.js';
import { Reconciler } from './reconciler.js';
import { buildServer } from './server.js';
import type { RigServices } from './services.js';
import type { DockerEngine } from './docker/engine.js';
import { TrafficCollector } from './metrics/traffic.js';
import { hashPassword } from './crypto.js';
import { SESSION_COOKIE } from './auth.js';

const DATABASE_URL = process.env.RIG_TEST_DATABASE_URL;
const quiet = { info: () => {}, warn: () => {}, error: () => {} };

/** Stands in for Docker, so these tests are about the API's rules, not containers. */
function stubEngine(): DockerEngine {
  const progress = {
    begin: () => {},
    set: () => {},
    finish: () => {},
    get: () => null,
    forget: () => {},
  };
  return {
    progress,
    platform: async () => 'linux/test',
    ping: async () => {},
    ensureReady: async () => {},
    deploy: async () => ({ containerId: 'stub-container' }),
    start: async () => {},
    stop: async () => {},
    restart: async () => {},
    removeContainer: async () => {},
    findContainer: async () => undefined,
    listManaged: async () => [],
    statusOf: async () => ({ status: 'running' as const, containerId: 'stub-container', detail: null }),
    logStream: async () => {
      throw new Error('There is no container for this app yet.');
    },
    stats: async () => {
      throw new Error('There is no container for this app yet.');
    },
    imageDigest: async () => null,
    logger: () => quiet,
  } as unknown as DockerEngine;
}

describe.skipIf(!DATABASE_URL)('the api', () => {
  let fastify: FastifyInstance;
  let services: RigServices;
  let db: Db;
  let config: Config;

  // Each run gets its own database, so migrations start from nothing and leftover
  // rows from an earlier run can never affect the result.
  const dbName = `rig_test_${randomBytes(4).toString('hex')}`;
  let ownerId = '';
  let otherId = '';
  let ownerCookie = '';
  let otherCookie = '';

  async function onMaintenanceDb(statement: string): Promise<void> {
    const client = new Client({ connectionString: DATABASE_URL });
    await client.connect();
    try {
      await client.query(statement);
    } finally {
      await client.end();
    }
  }

  beforeAll(async () => {
    await onMaintenanceDb(`create database ${dbName}`);

    const url = new URL(DATABASE_URL!);
    url.pathname = `/${dbName}`;

    config = loadConfig({
      DATABASE_URL: url.toString(),
      SESSION_SECRET: 'test-session-secret-that-is-long-enough',
      ENV_ENCRYPTION_KEY: randomBytes(32).toString('base64'),
      OWNER_EMAIL: 'owner@example.com',
      BASE_DOMAIN: 'example.test',
      COOKIE_SECURE: 'false',
      LOG_LEVEL: 'silent',
      WEB_DIST: '/nowhere',
    } as NodeJS.ProcessEnv);

    const created = createDb(config.DATABASE_URL);
    db = created.db;
    await waitForDatabase(created.pool, 20, 500);
    await runMigrations(db);

    const engine = stubEngine();
    const apps = new AppsService(db, engine, config, quiet);
    services = {
      config,
      pool: created.pool,
      db,
      engine,
      apps,
      reconciler: new Reconciler(db, engine, apps, config, quiet),
      // No metrics URL, so the collector is off and the route says so.
      traffic: new TrafficCollector('', quiet),
      close: async () => {
        await created.pool.end();
      },
    };
    fastify = await buildServer(services);
    await fastify.ready();

    const inserted = await db
      .insert(schema.users)
      .values([
        { email: 'owner@example.com', passwordHash: await hashPassword('owner-password'), role: 'owner' },
        { email: 'member@example.com', passwordHash: await hashPassword('member-password'), role: 'member' },
      ])
      .returning();
    ownerId = inserted[0]!.id;
    otherId = inserted[1]!.id;

    ownerCookie = await signIn('owner@example.com', 'owner-password');
    otherCookie = await signIn('member@example.com', 'member-password');
  }, 60_000);

  afterAll(async () => {
    await fastify?.close();
    // The pool has to be shut before the database can be dropped.
    await services?.close();
    await onMaintenanceDb(`drop database if exists ${dbName}`).catch(() => {});
  });

  // Signing in is rate limited per client address, and that limit is itself under
  // test further down, so every other sign in comes from its own address.
  let attempt = 0;
  function freshAddress(): string {
    attempt += 1;
    return `198.51.100.${attempt}`;
  }

  async function attemptLogin(email: string, password: string, ip = freshAddress()) {
    return fastify.inject({
      method: 'POST',
      url: '/api/auth/login',
      headers: { 'x-forwarded-for': ip },
      payload: { email, password },
    });
  }

  async function signIn(email: string, password: string): Promise<string> {
    const response = await attemptLogin(email, password);
    expect(response.statusCode, response.body).toBe(200);
    const cookie = response.cookies.find((c) => c.name === SESSION_COOKIE);
    expect(cookie).toBeDefined();
    return `${SESSION_COOKIE}=${cookie!.value}`;
  }

  /* ------------------------------------------------------------ public routes */

  it('answers the health check without a session', async () => {
    const response = await fastify.inject({ method: 'GET', url: '/api/health' });
    const body = response.json() as { checks: { name: string; ok: boolean }[] };
    // Docker is stubbed, so the report is about reachability of the real database.
    expect(body.checks.find((c) => c.name === 'database')?.ok).toBe(true);
  });

  /* ------------------------------------------------------------------- login */

  it('refuses a wrong password, and says so without naming which part was wrong', async () => {
    const response = await attemptLogin('owner@example.com', 'not-it');
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'Wrong email or password.' });
  });

  it('refuses an account that does not exist with the same message', async () => {
    const response = await attemptLogin('nobody@example.com', 'whatever');
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: 'Wrong email or password.' });
  });

  it('sets an httpOnly cookie on the way in', async () => {
    const response = await attemptLogin('owner@example.com', 'owner-password');
    const cookie = response.cookies.find((c) => c.name === SESSION_COOKIE)!;
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.sameSite?.toLowerCase()).toBe('lax');
  });

  /* ------------------------------------------------------- the session guard */

  const PROTECTED: [string, string][] = [
    ['GET', '/api/auth/me'],
    ['GET', '/api/server-info'],
    ['GET', '/api/apps'],
    ['POST', '/api/apps'],
    ['GET', '/api/activity'],
    ['GET', '/api/unknown-containers'],
    ['GET', '/api/apps/11111111-1111-1111-1111-111111111111'],
    ['PATCH', '/api/apps/11111111-1111-1111-1111-111111111111'],
    ['DELETE', '/api/apps/11111111-1111-1111-1111-111111111111'],
    ['POST', '/api/apps/11111111-1111-1111-1111-111111111111/start'],
    ['POST', '/api/apps/11111111-1111-1111-1111-111111111111/stop'],
    ['POST', '/api/apps/11111111-1111-1111-1111-111111111111/restart'],
    ['POST', '/api/apps/11111111-1111-1111-1111-111111111111/redeploy'],
    ['GET', '/api/apps/11111111-1111-1111-1111-111111111111/logs'],
    ['GET', '/api/apps/11111111-1111-1111-1111-111111111111/stats'],
    ['GET', '/api/apps/11111111-1111-1111-1111-111111111111/traffic'],
    ['GET', '/api/apps/11111111-1111-1111-1111-111111111111/progress'],
    ['POST', '/api/auth/password'],
    ['POST', '/api/auth/logout-everywhere'],
  ];

  it.each(PROTECTED)('%s %s needs a session', async (method, url) => {
    const response = await fastify.inject({ method: method as 'GET', url });
    expect(response.statusCode).toBe(401);
  });

  it('rejects a made up cookie', async () => {
    const response = await fastify.inject({
      method: 'GET',
      url: '/api/apps',
      headers: { cookie: `${SESSION_COOKIE}=not-a-real-token` },
    });
    expect(response.statusCode).toBe(401);
  });

  /* --------------------------------------------------------------- app rules */

  it('creates an app and hands back its public address', async () => {
    const response = await fastify.inject({
      method: 'POST',
      url: '/api/apps',
      headers: { cookie: ownerCookie },
      payload: { name: 'hello', image: 'nginxdemos/hello', internalPort: 80 },
    });
    expect(response.statusCode, response.body).toBe(201);
    const app = response.json() as { name: string; url: string; hostname: string; status: string };
    expect(app.url).toBe('https://hello.example.test');
    expect(app.hostname).toBe('hello.example.test');
    expect(app.status).toBe('deploying');
  });

  it('refuses a second app with the same name, because the name is the address', async () => {
    const response = await fastify.inject({
      method: 'POST',
      url: '/api/apps',
      headers: { cookie: ownerCookie },
      payload: { name: 'hello', image: 'nginxdemos/hello', internalPort: 80 },
    });
    expect(response.statusCode).toBe(400);
    expect((response.json() as { error: string }).error).toMatch(/already taken/i);
  });

  it('refuses a reserved hostname', async () => {
    for (const name of ['www', 'rig', 'api']) {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/apps',
        headers: { cookie: ownerCookie },
        payload: { name, image: 'nginxdemos/hello', internalPort: 80 },
      });
      expect(response.statusCode, name).toBe(400);
    }
  });

  it('refuses a name that is not a valid hostname', async () => {
    for (const name of ['Hello', 'has space', '-lead', 'trail-', 'ab']) {
      const response = await fastify.inject({
        method: 'POST',
        url: '/api/apps',
        headers: { cookie: ownerCookie },
        payload: { name, image: 'nginxdemos/hello', internalPort: 80 },
      });
      expect(response.statusCode, name).toBe(400);
    }
  });

  it('keeps environment values out of the list, and encrypted in the database', async () => {
    const created = await fastify.inject({
      method: 'POST',
      url: '/api/apps',
      headers: { cookie: ownerCookie },
      payload: {
        name: 'with-secrets',
        image: 'nginxdemos/hello',
        internalPort: 80,
        env: { API_TOKEN: 'super-secret-value' },
      },
    });
    const id = (created.json() as { id: string }).id;

    const rows = await db.select().from(schema.apps).where(sql`${schema.apps.id} = ${id}`);
    expect(rows[0]!.envEncrypted).not.toContain('super-secret-value');

    const detail = await fastify.inject({ method: 'GET', url: `/api/apps/${id}`, headers: { cookie: ownerCookie } });
    expect((detail.json() as { env: Record<string, string> }).env).toEqual({ API_TOKEN: 'super-secret-value' });

    const list = await fastify.inject({ method: 'GET', url: '/api/apps', headers: { cookie: ownerCookie } });
    expect(list.body).not.toContain('super-secret-value');
  });

  it('hides another person\'s app behind a not found', async () => {
    const created = await fastify.inject({
      method: 'POST',
      url: '/api/apps',
      headers: { cookie: otherCookie },
      payload: { name: 'members-app', image: 'nginxdemos/hello', internalPort: 80 },
    });
    const id = (created.json() as { id: string }).id;

    // The owner can see everything on their own server.
    const asOwner = await fastify.inject({ method: 'GET', url: `/api/apps/${id}`, headers: { cookie: ownerCookie } });
    expect(asOwner.statusCode).toBe(200);

    // A member cannot reach an app that belongs to someone else.
    const ownersApps = await fastify.inject({ method: 'GET', url: '/api/apps', headers: { cookie: ownerCookie } });
    const ownersFirst = (ownersApps.json() as { id: string; ownerId?: string }[]).find((a) => a.id !== id)!;
    for (const [method, suffix] of [
      ['GET', ''],
      ['PATCH', ''],
      ['DELETE', ''],
      ['POST', '/start'],
      ['POST', '/stop'],
      ['POST', '/restart'],
      ['POST', '/redeploy'],
      ['GET', '/logs'],
      ['GET', '/stats'],
    ] as const) {
      const response = await fastify.inject({
        method,
        url: `/api/apps/${ownersFirst.id}${suffix}`,
        headers: { cookie: otherCookie },
        payload: method === 'PATCH' ? { image: 'nginx' } : undefined,
      });
      expect(response.statusCode, `${method} ${suffix}`).toBe(404);
    }
  });

  it('only lists a member\'s own apps', async () => {
    const mine = await fastify.inject({ method: 'GET', url: '/api/apps', headers: { cookie: otherCookie } });
    const names = (mine.json() as { name: string }[]).map((a) => a.name);
    expect(names).toEqual(['members-app']);
  });

  it('lists unknown containers rather than removing them', async () => {
    const response = await fastify.inject({
      method: 'GET',
      url: '/api/unknown-containers',
      headers: { cookie: ownerCookie },
    });
    expect(response.statusCode).toBe(200);
    // The stub engine reports no containers, so the list is empty but present.
    expect(response.json()).toEqual([]);
  });

  it('says traffic is off rather than showing zeroes when Traefik has no metrics', async () => {
    const created = await fastify.inject({
      method: 'POST',
      url: '/api/apps',
      headers: { cookie: ownerCookie },
      payload: { name: 'traffic-app', image: 'nginxdemos/hello', internalPort: 80 },
    });
    const id = (created.json() as { id: string }).id;
    const response = await fastify.inject({
      method: 'GET',
      url: `/api/apps/${id}/traffic`,
      headers: { cookie: ownerCookie },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json() as { enabled: boolean; reason?: string };
    expect(body.enabled).toBe(false);
    expect(body.reason).toMatch(/not configured/i);
  });

  it('answers not found for an id that is not a uuid, rather than a server error', async () => {
    const response = await fastify.inject({
      method: 'GET',
      url: '/api/apps/not-a-uuid',
      headers: { cookie: ownerCookie },
    });
    expect(response.statusCode).toBe(404);
  });

  it('deletes an app and forgets it', async () => {
    const created = await fastify.inject({
      method: 'POST',
      url: '/api/apps',
      headers: { cookie: ownerCookie },
      payload: { name: 'to-delete', image: 'nginxdemos/hello', internalPort: 80 },
    });
    const id = (created.json() as { id: string }).id;

    const removed = await fastify.inject({ method: 'DELETE', url: `/api/apps/${id}`, headers: { cookie: ownerCookie } });
    expect(removed.statusCode).toBe(204);

    const after = await fastify.inject({ method: 'GET', url: `/api/apps/${id}`, headers: { cookie: ownerCookie } });
    expect(after.statusCode).toBe(404);

    // The activity feed keeps the name so the history still reads.
    const activity = await fastify.inject({ method: 'GET', url: '/api/activity', headers: { cookie: ownerCookie } });
    expect(activity.body).toContain('to-delete');
  });

  /* ----------------------------------------------------------------- account */

  it('changes a password and signs other devices out', async () => {
    const secondDevice = await signIn('member@example.com', 'member-password');

    const changed = await fastify.inject({
      method: 'POST',
      url: '/api/auth/password',
      headers: { cookie: otherCookie },
      payload: { currentPassword: 'member-password', newPassword: 'a-longer-password' },
    });
    expect(changed.statusCode, changed.body).toBe(200);

    const stale = await fastify.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie: secondDevice } });
    expect(stale.statusCode).toBe(401);

    // The device that made the change keeps working, with its fresh cookie.
    const fresh = changed.cookies.find((c) => c.name === SESSION_COOKIE)!;
    const still = await fastify.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { cookie: `${SESSION_COOKIE}=${fresh.value}` },
    });
    expect(still.statusCode).toBe(200);
    otherCookie = `${SESSION_COOKIE}=${fresh.value}`;
  });

  it('refuses a password change without the current password', async () => {
    const response = await fastify.inject({
      method: 'POST',
      url: '/api/auth/password',
      headers: { cookie: ownerCookie },
      payload: { currentPassword: 'wrong', newPassword: 'another-long-password' },
    });
    expect(response.statusCode).toBe(400);
    expect((response.json() as { field?: string }).field).toBe('currentPassword');
  });

  it('ends the session on sign out', async () => {
    const cookie = await signIn('owner@example.com', 'owner-password');
    const out = await fastify.inject({ method: 'POST', url: '/api/auth/logout', headers: { cookie } });
    expect(out.statusCode).toBe(200);
    const after = await fastify.inject({ method: 'GET', url: '/api/auth/me', headers: { cookie } });
    expect(after.statusCode).toBe(401);
  });

  it('rate limits password guessing', async () => {
    const attempts = await Promise.all(
      Array.from({ length: 12 }, () => attemptLogin('owner@example.com', 'guess', '203.0.113.9')),
    );
    expect(attempts.filter((r) => r.statusCode === 401).length).toBeLessThanOrEqual(5);
    expect(attempts.some((r) => r.statusCode === 429)).toBe(true);
  });

  /* -------------------------------------------------------------- unknown api */

  it('returns json, not the dashboard, for an unknown api path', async () => {
    const response = await fastify.inject({ method: 'GET', url: '/api/nope', headers: { cookie: ownerCookie } });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: 'No such endpoint.' });
  });

  it('keeps the owner id on the app it created', async () => {
    const rows = await db.select().from(schema.apps).where(sql`${schema.apps.name} = 'members-app'`);
    expect(rows[0]!.ownerId).toBe(otherId);
    expect(rows[0]!.ownerId).not.toBe(ownerId);
  });
});
