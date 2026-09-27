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
  orphansRemoved: number;
  restarted: number;
}

/**
 * Docker is the truth about what is running; the database is only Rig's record of
 * it. This walks both lists and brings the record back in line, which is what
 * makes the dashboard correct after a reboot, a crash or a manual `docker rm`.
 */
export class Reconciler {
  private timer: NodeJS.Timeout | null = null;
  private running = false;

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

  async runOnce(): Promise<ReconcileSummary> {
    if (this.running) return { checked: 0, statusChanges: 0, orphansRemoved: 0, restarted: 0 };
    this.running = true;
    const summary: ReconcileSummary = { checked: 0, statusChanges: 0, orphansRemoved: 0, restarted: 0 };

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

      // A container carrying Rig's label with no row behind it is left over from a
      // deleted app. Remove it so the hostname really does stop resolving.
      const knownIds = new Set(rows.map((r) => r.id));
      for (const container of containers) {
        const appId = container.Labels?.[APP_ID_LABEL];
        const appName = container.Labels?.[APP_NAME_LABEL];
        if (appId && knownIds.has(appId)) continue;
        if (!appName) continue;
        this.log.warn({ container: appName }, 'removing orphan container');
        await this.engine.removeContainer(appName, appId);
        await this.apps.record(null, appName, null, 'reconcile', 'ok', 'Removed a leftover container');
        summary.orphansRemoved++;
      }

      return summary;
    } finally {
      this.running = false;
    }
  }
}
