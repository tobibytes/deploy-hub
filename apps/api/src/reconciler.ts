import { eq } from 'drizzle-orm';
import type { Config } from './config.js';
import type { Db } from './db/index.js';
import { schema } from './db/index.js';
import { APP_ID_LABEL, APP_NAME_LABEL } from './docker/labels.js';
import type { DockerEngine } from './docker/engine.js';
import { mapStatus } from './docker/engine.js';
import type { AppsService } from './apps-service.js';

export interface ReconcileSummary {
  checked: number;
  statusChanges: number;
  unknown: number;
  restarted: number;
}

/** A container carrying Rig's label that has no row behind it. */
export interface UnknownContainer {
  name: string;
  image: string;
  status: string;
  appName: string | null;
  seenAt: string;
}

/**
 * Docker is the truth about what is running; the database is only Rig's record of
 * it. This walks both lists and brings the record back in line, which is what
 * makes the dashboard correct after a reboot, a crash or a manual `docker rm`.
 */
export class Reconciler {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private unknownContainers: UnknownContainer[] = [];

  constructor(
    private readonly db: Db,
    private readonly engine: DockerEngine,
    private readonly apps: AppsService,
    private readonly cfg: Config,
    private readonly log: { info: (o: unknown, m?: string) => void; warn: (o: unknown, m?: string) => void; error: (o: unknown, m?: string) => void },
  ) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.runOnce().catch((error: unknown) => {
        this.log.warn({ error: String(error) }, 'reconcile failed, will try again');
      });
    }, this.cfg.RECONCILE_INTERVAL_MS);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Containers wearing Rig's label that no app owns. Left running on purpose. */
  unknown(): UnknownContainer[] {
    return [...this.unknownContainers];
  }

  async runOnce(): Promise<ReconcileSummary> {
    if (this.running) return { checked: 0, statusChanges: 0, unknown: 0, restarted: 0 };
    this.running = true;
    const summary: ReconcileSummary = { checked: 0, statusChanges: 0, unknown: 0, restarted: 0 };

    try {
      const [rows, containers] = await Promise.all([
        this.db.select().from(schema.apps),
        this.engine.listManaged(),
      ]);
      summary.checked = rows.length;

      const byAppId = new Map<string, (typeof containers)[number]>();
      for (const container of containers) {
        const id = container.Labels?.[APP_ID_LABEL];
        if (id) byAppId.set(id, container);
      }

      for (const row of rows) {
        // A deploy in flight owns the row, so leave it alone.
        if (row.status === 'deploying') continue;

        const container = byAppId.get(row.id);
        if (!container) {
          if (row.status !== 'stopped' || row.containerId !== null) {
            await this.db
              .update(schema.apps)
              .set({
                status: 'stopped',
                containerId: null,
                lastError: 'The container is gone. Redeploy to bring it back.',
                updatedAt: new Date(),
              })
              .where(eq(schema.apps.id, row.id));
            await this.apps.record(row.id, row.name, null, 'reconcile', 'error', 'The container is gone');
            summary.statusChanges++;
            this.log.warn({ app: row.name }, 'container missing, marked stopped');
          }
          continue;
        }

        const actual = mapStatus(container.State, container.Status);
        if (actual !== row.status || row.containerId !== container.Id) {
          await this.db
            .update(schema.apps)
            .set({
              status: actual,
              containerId: container.Id,
              lastError: actual === 'failed' ? (container.Status ?? 'The container stopped with an error.') : null,
              updatedAt: new Date(),
            })
            .where(eq(schema.apps.id, row.id));
          if (actual !== row.status) {
            await this.apps.record(
              row.id,
              row.name,
              null,
              'reconcile',
              actual === 'failed' ? 'error' : 'ok',
              `Docker says ${actual}${container.Status ? ` (${container.Status})` : ''}`,
            );
            summary.statusChanges++;
          }
        }
      }

      // A container carrying Rig's label with no row behind it gets left alone
      // and listed, rather than removed. It may be something started by hand,
      // and deleting it would be the one mistake here that cannot be undone.
      const knownIds = new Set(rows.map((r) => r.id));
      const unknown: UnknownContainer[] = [];
      for (const container of containers) {
        const appId = container.Labels?.[APP_ID_LABEL];
        if (appId && knownIds.has(appId)) continue;
        unknown.push({
          name: container.Names?.[0]?.replace(/^\//, '') ?? container.Id.slice(0, 12),
          image: container.Image ?? 'unknown',
          status: container.Status ?? '',
          appName: container.Labels?.[APP_NAME_LABEL] ?? null,
          seenAt: new Date().toISOString(),
        });
      }

      // Only say something when the set changes, rather than every 30 seconds.
      const before = this.unknownContainers.map((c) => c.name).sort().join(',');
      const after = unknown.map((c) => c.name).sort().join(',');
      if (before !== after && unknown.length > 0) {
        this.log.warn({ containers: unknown.map((c) => c.name) }, 'containers with a rig label and no app');
      }
      this.unknownContainers = unknown;
      summary.unknown = unknown.length;

      return summary;
    } finally {
      this.running = false;
    }
  }
}
