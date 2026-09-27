import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import * as schema from './schema.js';

export type Db = ReturnType<typeof createDb>['db'];

export function createDb(databaseUrl: string) {
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
  const db = drizzle(pool, { schema });
  return { pool, db };
}

/**
 * Postgres inside Compose takes a few seconds to accept connections on a cold
 * boot, and after a power cut the whole stack starts at once. Retrying here is
 * what makes "unplug the Pi and plug it back in" work without human help.
 */
export async function waitForDatabase(pool: Pool, attempts = 30, delayMs = 1000): Promise<void> {
  let lastError: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      const client = await pool.connect();
      client.release();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw new Error(`Could not reach Postgres after ${attempts} tries: ${String(lastError)}`);
}

/**
 * The migrations live next to the source in development and next to the bundle
 * in the image, so check both rather than guessing from one layout.
 */
export function migrationsFolder(): string {
  if (process.env.MIGRATIONS_DIR) return process.env.MIGRATIONS_DIR;
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(here, '../../migrations'), // src/db -> apps/api/migrations
    resolve(here, '../migrations'),    // dist    -> /app/migrations
    resolve(process.cwd(), 'migrations'),
  ];
  const found = candidates.find((dir) => existsSync(resolve(dir, 'meta/_journal.json')));
  if (!found) {
    throw new Error(`Could not find the migrations folder. Looked in:\n  ${candidates.join('\n  ')}`);
  }
  return found;
}

export async function runMigrations(db: Db): Promise<void> {
  await migrate(db, { migrationsFolder: migrationsFolder() });
}

export { schema };
