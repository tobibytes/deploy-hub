import { desc, eq, sql } from 'drizzle-orm';
import {
  appUrl,
  appHostname,
  checkAppName,
  volumeName,
  type App,
  type AppDetail,
  type AppEvent,
  type AppStatus,
  type CreateAppInput,
  type EventAction,
  type UpdateAppInput,
} from '@rig/shared';
import type { Config } from './config.js';
import type { Db } from './db/index.js';
import { schema } from './db/index.js';
import type { AppRow } from './db/schema.js';
import { decryptJson, encryptJson, readKey } from './crypto.js';
import type { DockerEngine } from './docker/engine.js';

/** Raised when the caller is at fault, so routes can answer 400 instead of 500. */
export class InputError extends Error {
  constructor(message: string, readonly field?: string) {
    super(message);
    this.name = 'InputError';
  }
}

export class NotFoundError extends Error {
  constructor(message = 'That app does not exist.') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class AppsService {
  private readonly key: Buffer;

  /** Set by the server so deleting an app also drops its traffic history. */
  onRemoved?: (appName: string) => void;

  constructor(
    private readonly db: Db,
    private readonly engine: DockerEngine,
    private readonly cfg: Config,
    private readonly log: { info: (o: unknown, m?: string) => void; error: (o: unknown, m?: string) => void },
  ) {
    this.key = readKey(cfg.ENV_ENCRYPTION_KEY);
  }

  /* ------------------------------------------------------------ conversion */

  private toApp(row: AppRow): App {
    return {
      id: row.id,
      name: row.name,
      image: row.image,
      internalPort: row.internalPort,
      status: row.status,
      url: appUrl(row.name, this.cfg.BASE_DOMAIN),
      hostname: appHostname(row.name, this.cfg.BASE_DOMAIN),
      memoryMb: row.memoryMb,
      cpuCores: row.cpuCores,
      volumePath: row.volumePath,
      volumeName: row.volumePath ? volumeName(row.name) : null,
      containerId: row.containerId,
      lastError: row.lastError,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  env(row: AppRow): Record<string, string> {
    if (!row.envEncrypted) return {};
    return decryptJson<Record<string, string>>(row.envEncrypted, this.key, {});
  }

  /* ----------------------------------------------------------------- reads */

  async list(userId: string, isOwner: boolean): Promise<App[]> {
    const rows = isOwner
      ? await this.db.select().from(schema.apps).orderBy(desc(schema.apps.createdAt))
      : await this.db
          .select()
          .from(schema.apps)
          .where(eq(schema.apps.ownerId, userId))
          .orderBy(desc(schema.apps.createdAt));
    return rows.map((r) => this.toApp(r));
  }

  async row(id: string): Promise<AppRow> {
    const rows = await this.db.select().from(schema.apps).where(eq(schema.apps.id, id)).limit(1);
    const row = rows[0];
    if (!row) throw new NotFoundError();
    return row;
  }

  async detail(id: string): Promise<AppDetail> {
    const row = await this.row(id);
    return { ...this.toApp(row), env: this.env(row), events: await this.events(id) };
  }

  async events(appId: string, limit = 50): Promise<AppEvent[]> {
    const rows = await this.db
      .select()
      .from(schema.events)
      .where(eq(schema.events.appId, appId))
      .orderBy(desc(schema.events.createdAt))
      .limit(limit);
    return rows.map((r) => ({
      id: r.id,
      action: r.action,
      status: r.status,
      message: r.message,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async recentActivity(limit = 100): Promise<(AppEvent & { appName: string | null; appId: string | null })[]> {
    const rows = await this.db
      .select()
      .from(schema.events)
      .orderBy(desc(schema.events.createdAt))
      .limit(limit);
    return rows.map((r) => ({
      id: r.id,
      action: r.action,
      status: r.status,
      message: r.message,
      createdAt: r.createdAt.toISOString(),
      appName: r.appName,
      appId: r.appId,
    }));
  }

  /* ---------------------------------------------------------------- writes */

  async record(
    appId: string | null,
    appName: string | null,
    userId: string | null,
    action: EventAction,
    status: 'ok' | 'error' = 'ok',
    message?: string,
  ): Promise<void> {
    await this.db.insert(schema.events).values({
      appId,
      appName,
      userId,
      action,
      status,
      message: message?.slice(0, 2000) ?? null,
    });
  }

  private async setStatus(id: string, status: AppStatus, lastError: string | null): Promise<void> {
    await this.db
      .update(schema.apps)
      .set({ status, lastError, updatedAt: new Date() })
      .where(eq(schema.apps.id, id));
  }

  /** Names are unique across the install because each one is a public hostname. */
  private async assertNameFree(name: string): Promise<void> {
    const verdict = checkAppName(name, [...this.cfg.extraReservedNames]);
    if (!verdict.ok) throw new InputError(verdict.reason, 'name');
    const taken = await this.db
      .select({ id: schema.apps.id })
      .from(schema.apps)
      .where(sql`lower(${schema.apps.name}) = ${name.toLowerCase()}`)
      .limit(1);
    if (taken.length > 0) throw new InputError(`"${name}" is already taken. Pick another name.`, 'name');
  }

  async create(userId: string, input: CreateAppInput): Promise<App> {
    await this.assertNameFree(input.name);

    const inserted = await this.db
      .insert(schema.apps)
      .values({
        ownerId: userId,
        name: input.name,
        image: input.image,
        internalPort: input.internalPort,
        envEncrypted: encryptJson(input.env, this.key),
        memoryMb: input.memoryMb,
        cpuCores: input.cpuCores,
        volumePath: input.volumePath,
        status: 'deploying',
      })
      .returning();
    const row = inserted[0];
    if (!row) throw new Error('Could not save the app.');

    await this.record(row.id, row.name, userId, 'create', 'ok', `${row.image} on port ${row.internalPort}`);
    // Deploying takes longer than a request should, so it runs in the background
    // and the dashboard follows the progress.
    void this.deployInBackground(row, userId);
    return this.toApp(row);
  }

  async update(id: string, userId: string, input: UpdateAppInput): Promise<App> {
    const row = await this.row(id);
    const patch: Partial<AppRow> = { updatedAt: new Date() };
    const notes: string[] = [];

    if (input.image !== undefined && input.image !== row.image) {
      patch.image = input.image;
      notes.push(`image ${row.image} to ${input.image}`);
    }
    if (input.internalPort !== undefined && input.internalPort !== row.internalPort) {
      patch.internalPort = input.internalPort;
      notes.push(`port ${row.internalPort} to ${input.internalPort}`);
    }
    if (input.memoryMb !== undefined && input.memoryMb !== row.memoryMb) {
      patch.memoryMb = input.memoryMb;
      notes.push(`memory ${row.memoryMb}MB to ${input.memoryMb}MB`);
    }
    if (input.cpuCores !== undefined && input.cpuCores !== row.cpuCores) {
      patch.cpuCores = input.cpuCores;
      notes.push(`CPU ${row.cpuCores} to ${input.cpuCores}`);
    }
    if (input.volumePath !== undefined && input.volumePath !== row.volumePath) {
      patch.volumePath = input.volumePath;
      // The volume itself is never dropped here. Moving or removing the mount
      // leaves the data where it is, so pointing at it again recovers it.
      notes.push(
        input.volumePath
          ? `stored data mounted at ${input.volumePath}`
          : `stored data no longer mounted, and kept in ${volumeName(row.name)}`,
      );
    }
    let envChanged = false;
    if (input.env !== undefined) {
      const before = this.env(row);
      envChanged = JSON.stringify(sorted(before)) !== JSON.stringify(sorted(input.env));
      if (envChanged) {
        patch.envEncrypted = encryptJson(input.env, this.key);
        notes.push(`${Object.keys(input.env).length} environment values`);
      }
    }

    if (notes.length === 0) return this.toApp(row);

    patch.status = 'deploying';
    patch.lastError = null;
    const updated = await this.db.update(schema.apps).set(patch).where(eq(schema.apps.id, id)).returning();
    const next = updated[0] ?? row;

    await this.record(
      id,
      next.name,
      userId,
      envChanged && notes.length === 1 ? 'env_change' : 'limits_change',
      'ok',
      `Changed ${notes.join(', ')}`,
    );
    void this.deployInBackground(next, userId);
    return this.toApp(next);
  }

  async redeploy(id: string, userId: string): Promise<App> {
    const row = await this.row(id);
    await this.setStatus(id, 'deploying', null);
    await this.record(id, row.name, userId, 'redeploy', 'ok', `Pulling ${row.image} again`);
    void this.deployInBackground(row, userId);
    return this.toApp({ ...row, status: 'deploying' });
  }

  async start(id: string, userId: string): Promise<App> {
    const row = await this.row(id);
    try {
      await this.engine.start(row);
      await this.setStatus(id, 'running', null);
      await this.record(id, row.name, userId, 'start');
    } catch (error) {
      // No container yet, so treat "start" as "deploy".
      await this.setStatus(id, 'deploying', null);
      await this.record(id, row.name, userId, 'start', 'ok', 'No container yet, deploying instead');
      void this.deployInBackground(row, userId);
      this.log.info({ app: row.name, error: String(error) }, 'start fell back to deploy');
    }
    return this.detailStatus(id);
  }

  async stop(id: string, userId: string): Promise<App> {
    const row = await this.row(id);
    await this.engine.stop(row);
    await this.setStatus(id, 'stopped', null);
    await this.record(id, row.name, userId, 'stop');
    return this.detailStatus(id);
  }

  async restart(id: string, userId: string): Promise<App> {
    const row = await this.row(id);
    await this.engine.restart(row);
    await this.setStatus(id, 'running', null);
    await this.record(id, row.name, userId, 'restart');
    return this.detailStatus(id);
  }

  /**
   * Deleting always removes the container. Stored data is only removed when
   * asked for, because it is the one step here that cannot be undone.
   */
  async remove(id: string, userId: string, deleteData = false): Promise<void> {
    const row = await this.row(id);
    await this.engine.removeContainer(row.name, row.id);

    let dataNote = '';
    if (row.volumePath) {
      if (deleteData) {
        await this.engine.removeVolume(volumeName(row.name));
        dataNote = ', and its stored data was deleted';
      } else {
        dataNote = `, and its stored data was kept in ${volumeName(row.name)}`;
      }
    }

    await this.db.delete(schema.apps).where(eq(schema.apps.id, id));
    this.engine.progress.forget(id);
    this.onRemoved?.(row.name);
    // The app row is gone, so this event keeps only the name for the feed.
    await this.record(
      null,
      row.name,
      userId,
      'delete',
      'ok',
      `${row.name}.${this.cfg.BASE_DOMAIN} no longer resolves${dataNote}`,
    );
  }

  private async detailStatus(id: string): Promise<App> {
    return this.toApp(await this.row(id));
  }

  /* ------------------------------------------------------------ deployment */

  private async deployInBackground(row: AppRow, userId: string | null): Promise<void> {
    try {
      const { containerId } = await this.engine.deploy({ app: row, env: this.env(row) });
      await this.db
        .update(schema.apps)
        .set({ status: 'running', containerId, lastError: null, updatedAt: new Date() })
        .where(eq(schema.apps.id, row.id));
      await this.record(row.id, row.name, userId, 'deploy', 'ok', `Live at ${row.name}.${this.cfg.BASE_DOMAIN}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.setStatus(row.id, 'failed', message);
      await this.record(row.id, row.name, userId, 'deploy', 'error', message);
      this.log.error({ app: row.name, error: message }, 'deploy failed');
    }
  }

  progress(id: string) {
    return this.engine.progress.get(id);
  }
}

function sorted(obj: Record<string, string>): [string, string][] {
  return Object.entries(obj).sort(([a], [b]) => a.localeCompare(b));
}
