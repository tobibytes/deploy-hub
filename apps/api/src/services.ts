import type { Pool } from 'pg';
import type { Config } from './config.js';
import { createDb, runMigrations, waitForDatabase, type Db } from './db/index.js';
import { createDocker } from './docker/client.js';
import { DockerEngine } from './docker/engine.js';
import { AppsService } from './apps-service.js';
import { Reconciler } from './reconciler.js';
import { ensureOwner, pruneExpiredSessions } from './auth.js';
import { TrafficCollector } from './metrics/traffic.js';
import { withTimeout } from './timeout.js';

export interface Logger {
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
}

export interface RigServices {
  config: Config;
  pool: Pool;
  db: Db;
  engine: DockerEngine;
  apps: AppsService;
  reconciler: Reconciler;
  traffic: TrafficCollector;
  close(): Promise<void>;
}

/**
 * Builds everything the server needs and brings the host into a usable state:
 * waits for Postgres, applies migrations, makes sure the apps network exists and
 * the owner account is there. Running it twice changes nothing, which is what
 * lets `docker compose up -d` be the only command needed for an update.
 */
export async function createServices(config: Config, log: Logger): Promise<RigServices> {
  const { pool, db } = createDb(config.DATABASE_URL);

  log.info({}, 'waiting for postgres');
  await waitForDatabase(pool);
  log.info({}, 'applying migrations');
  await runMigrations(db);

  const engine = new DockerEngine(createDocker(config), config, log);
  try {
    await withTimeout('Docker', 20_000, engine.ensureReady());
    log.info({ platform: await engine.platform() }, 'docker ready');
  } catch (error) {
    // Rig carries on and serves the dashboard, so the failure shows up on
    // /api/health and in the interface rather than only in the logs. The
    // reconciler keeps trying, so it recovers on its own once Docker is back.
    log.error({ error: String(error) }, 'docker is not reachable yet');
  }

  const apps = new AppsService(db, engine, config, log);
  const reconciler = new Reconciler(db, engine, apps, config, log);
  const traffic = new TrafficCollector(config.TRAEFIK_METRICS_URL, log);
  apps.onRemoved = (name) => traffic.forget(name);

  const owner = await ensureOwner(db, config);
  log.info({ owner: config.OWNER_EMAIL, result: owner }, 'owner account');
  if (owner === 'skipped') {
    log.warn(
      {},
      'no owner account yet: set OWNER_PASSWORD in deploy/.env, or run "docker compose exec rig node dist/cli.js create-owner"',
    );
  }
  await pruneExpiredSessions(db);

  return {
    config,
    pool,
    db,
    engine,
    apps,
    reconciler,
    traffic,
    async close() {
      reconciler.stop();
      traffic.stop();
      await pool.end();
    },
  };
}
