import type { AppStats, AppStatus } from '@rig/shared';
import type { AppRow } from '../db/schema.js';
import type { Config } from '../config.js';
import { ensureNetwork, hostPlatform, pullImage, type Docker } from './client.js';
import { APP_ID_LABEL, MANAGED_LABEL, containerName, containerSpec } from './labels.js';
import { volumeName } from '@rig/shared';
import { DeployProgress } from './progress.js';
import { withTimeout } from '../timeout.js';

export interface EngineLogger {
  info(obj: unknown, msg?: string): void;
  warn(obj: unknown, msg?: string): void;
  error(obj: unknown, msg?: string): void;
}

/** Everything the engine needs to turn a row in `apps` into a running container. */
export interface DeployInput {
  app: Pick<AppRow, 'id' | 'name' | 'image' | 'internalPort' | 'memoryMb' | 'cpuCores' | 'volumePath'>;
  env: Record<string, string>;
}

export interface DeployResult {
  containerId: string;
}

export class DockerEngine {
  readonly progress = new DeployProgress();
  private platformCache: string | null = null;

  constructor(
    private readonly docker: Docker,
    private readonly cfg: Config,
    private readonly log: EngineLogger,
  ) {}

  async platform(): Promise<string> {
    this.platformCache ??= await withTimeout('Docker', 10_000, hostPlatform(this.docker));
    return this.platformCache;
  }

  async ping(): Promise<void> {
    await withTimeout('Docker', 5_000, this.docker.ping());
  }

  /**
   * Called on every boot. It must not be able to hang: if Docker is not up yet,
   * Rig still needs to serve the dashboard and say so on the health check.
   */
  async ensureReady(): Promise<void> {
    await this.ping();
    await withTimeout('Docker', 15_000, ensureNetwork(this.docker, this.cfg.APPS_NETWORK));
  }

  /* ------------------------------------------------------------- deploying */

  /**
   * Pulls the image, replaces any container for this app and starts the new one.
   * Safe to call again at any time, which is what makes redeploy and recovery
   * after a crash the same code path.
   */
  async deploy(input: DeployInput): Promise<DeployResult> {
    const { app } = input;
    const platform = await this.platform();
    this.progress.begin(app.id);

    try {
      this.progress.set(app.id, 'pull', 'active', `Looking for a ${platform} build`);
      await pullImage(this.docker, app.image, platform, (line) => {
        this.progress.set(app.id, 'pull', 'active', line);
      });
      this.progress.set(app.id, 'pull', 'done', `Image ready for ${platform}`);

      this.progress.set(app.id, 'create', 'active', 'Replacing any earlier container');
      await this.removeContainer(app.name, app.id);
      await ensureNetwork(this.docker, this.cfg.APPS_NETWORK);
      if (app.volumePath) {
        // Docker would make this on demand, but creating it here means a failed
        // deploy still leaves the data from the last one in place.
        await this.ensureVolume(volumeName(app.name));
      }

      const spec = containerSpec({
        appId: app.id,
        appName: app.name,
        image: app.image,
        env: input.env,
        internalPort: app.internalPort,
        memoryMb: app.memoryMb,
        cpuCores: app.cpuCores,
        volumePath: app.volumePath,
        domain: this.cfg.BASE_DOMAIN,
        network: this.cfg.APPS_NETWORK,
        entrypoint: this.cfg.TRAEFIK_ENTRYPOINT,
      });
      const created = await this.docker.createContainer(spec);
      this.progress.set(app.id, 'create', 'done', containerName(app.name));

      this.progress.set(app.id, 'start', 'active', 'Handing it to Docker');
      await created.start();
      this.progress.set(app.id, 'start', 'done', 'Container started');

      this.progress.set(app.id, 'route', 'active', `${app.name}.${this.cfg.BASE_DOMAIN}`);
      // Traefik notices the new container from the Docker event stream. Give it a
      // moment so the URL works by the time the dashboard says it is live.
      await waitUntilRunning(created, 15_000);
      this.progress.set(app.id, 'route', 'done', `${app.name}.${this.cfg.BASE_DOMAIN}`);

      this.progress.set(app.id, 'live', 'done', 'Your app is live');
      this.progress.finish(app.id);
      return { containerId: created.id };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const failing = this.progress.get(app.id)?.steps.find((s) => s.state === 'active')?.step ?? 'pull';
      this.progress.set(app.id, failing, 'failed', message);
      this.progress.finish(app.id, message);
      throw error;
    }
  }

  /* ------------------------------------------------------------- lifecycle */

  async start(app: Pick<AppRow, 'name'>): Promise<void> {
    const container = await this.findContainer(app.name);
    if (!container) throw new Error('There is no container for this app yet. Redeploy it.');
    await this.docker.getContainer(container.Id).start();
  }

  async stop(app: Pick<AppRow, 'name'>): Promise<void> {
    const container = await this.findContainer(app.name);
    if (!container) return;
    await this.docker.getContainer(container.Id).stop({ t: 10 }).catch(ignoreNotModified);
  }

  async restart(app: Pick<AppRow, 'name'>): Promise<void> {
    const container = await this.findContainer(app.name);
    if (!container) throw new Error('There is no container for this app yet. Redeploy it.');
    await this.docker.getContainer(container.Id).restart({ t: 10 });
  }

  /** Makes the app's named volume if it is not there. Existing data is untouched. */
  async ensureVolume(name: string): Promise<void> {
    await withTimeout('Docker', 15_000, this.docker.createVolume({ Name: name, Labels: { [MANAGED_LABEL]: 'true' } }));
  }

  /** Deletes a named volume and everything in it. Only ever called on request. */
  async removeVolume(name: string): Promise<void> {
    try {
      await withTimeout('Docker', 15_000, this.docker.getVolume(name).remove());
    } catch (error) {
      // Already gone is the outcome we wanted anyway.
      if ((error as { statusCode?: number }).statusCode === 404) return;
      throw error;
    }
  }

  /** Stops and deletes the container, which also removes the Traefik route. */
  async removeContainer(appName: string, appId?: string): Promise<void> {
    const container = await this.findContainer(appName, appId);
    if (!container) return;
    const handle = this.docker.getContainer(container.Id);
    await handle.stop({ t: 10 }).catch(ignoreNotModified);
    await handle.remove({ force: true, v: true }).catch(ignoreMissing);
  }

  /* -------------------------------------------------------------- watching */

  async findContainer(appName: string, appId?: string) {
    const all = await this.listManaged();
    const byId = appId ? all.find((c) => c.Labels?.[APP_ID_LABEL] === appId) : undefined;
    if (byId) return byId;
    const wanted = `/${containerName(appName)}`;
    return all.find((c) => c.Names?.includes(wanted));
  }

  async listManaged() {
    return withTimeout(
      'Docker',
      15_000,
      this.docker.listContainers({
        all: true,
        filters: { label: [`${MANAGED_LABEL}=true`] },
      }),
    );
  }

  async statusOf(appName: string, appId?: string): Promise<{ status: AppStatus; containerId: string | null; detail: string | null }> {
    const container = await this.findContainer(appName, appId);
    if (!container) return { status: 'stopped', containerId: null, detail: 'No container' };
    return { status: mapStatus(container.State, container.Status), containerId: container.Id, detail: container.Status ?? null };
  }

  /** Recent lines plus a live stream, demultiplexed into plain text. */
  async logStream(appName: string, tail = 200): Promise<NodeJS.ReadableStream> {
    const container = await this.findContainer(appName);
    if (!container) throw new Error('There is no container for this app yet.');
    const handle = this.docker.getContainer(container.Id);
    const details = await handle.inspect();
    const stream = (await handle.logs({
      follow: true,
      stdout: true,
      stderr: true,
      tail,
      timestamps: false,
    })) as unknown as NodeJS.ReadableStream;

    if (details.Config.Tty) return stream;

    // Without a TTY, Docker frames stdout and stderr together. Split them apart
    // so the log view shows text rather than control bytes.
    const { PassThrough } = await import('node:stream');
    const out = new PassThrough();
    this.docker.modem.demuxStream(stream, out, out);
    stream.on('end', () => out.end());
    stream.on('error', (err: Error) => out.destroy(err));
    (out as unknown as { closeUpstream?: () => void }).closeUpstream = () => {
      (stream as unknown as { destroy?: () => void }).destroy?.();
    };
    return out;
  }

  async stats(appName: string): Promise<AppStats> {
    const container = await this.findContainer(appName);
    if (!container) throw new Error('There is no container for this app yet.');
    const raw = (await this.docker.getContainer(container.Id).stats({ stream: false })) as DockerStats;
    return readStats(raw);
  }

  async imageDigest(appName: string): Promise<string | null> {
    const container = await this.findContainer(appName);
    if (!container) return null;
    const details = await this.docker.getContainer(container.Id).inspect();
    return details.Image ?? null;
  }

  logger(): EngineLogger {
    return this.log;
  }
}

/* -------------------------------------------------------------- helpers */

function ignoreNotModified(error: unknown): void {
  const status = (error as { statusCode?: number }).statusCode;
  // 304 means it was already stopped, 404 that it is already gone.
  if (status === 304 || status === 404) return;
  throw error;
}

function ignoreMissing(error: unknown): void {
  if ((error as { statusCode?: number }).statusCode === 404) return;
  throw error;
}

export function mapStatus(state: string | undefined, status: string | undefined): AppStatus {
  switch (state) {
    case 'running':
      return 'running';
    case 'restarting':
    case 'created':
      return 'deploying';
    case 'paused':
      return 'stopped';
    case 'exited':
    case 'dead': {
      // "Exited (0)" is a clean stop, anything else is a failure worth showing.
      const clean = /\((0)\)/.test(status ?? '');
      return clean ? 'stopped' : 'failed';
    }
    default:
      return 'stopped';
  }
}

async function waitUntilRunning(container: { inspect: () => Promise<any> }, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const details = await container.inspect();
    const state = details.State as { Running?: boolean; Restarting?: boolean; ExitCode?: number; Error?: string };
    if (state.Running) return;
    if (!state.Restarting && typeof state.ExitCode === 'number' && state.ExitCode !== 0) {
      throw new Error(
        `The container stopped straight away with exit code ${state.ExitCode}. ` +
          (state.Error ? `Docker said: ${state.Error}. ` : '') +
          'Check the logs, and make sure the port you set is the one the app listens on.',
      );
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error('The container did not reach a running state in time. Check the logs.');
}

interface DockerStats {
  cpu_stats?: { cpu_usage?: { total_usage?: number }; system_cpu_usage?: number; online_cpus?: number };
  precpu_stats?: { cpu_usage?: { total_usage?: number }; system_cpu_usage?: number };
  memory_stats?: { usage?: number; limit?: number; stats?: { cache?: number; inactive_file?: number } };
  networks?: Record<string, { rx_bytes?: number; tx_bytes?: number }>;
}

export function readStats(raw: DockerStats): AppStats {
  const cpuDelta = (raw.cpu_stats?.cpu_usage?.total_usage ?? 0) - (raw.precpu_stats?.cpu_usage?.total_usage ?? 0);
  const systemDelta = (raw.cpu_stats?.system_cpu_usage ?? 0) - (raw.precpu_stats?.system_cpu_usage ?? 0);
  const cpus = raw.cpu_stats?.online_cpus ?? 1;
  const cpuPercent = systemDelta > 0 && cpuDelta > 0 ? (cpuDelta / systemDelta) * cpus * 100 : 0;

  // Page cache counts towards `usage` but is reclaimable, so take it out to show
  // the number that actually matters against the limit.
  const cache = raw.memory_stats?.stats?.inactive_file ?? raw.memory_stats?.stats?.cache ?? 0;
  const memoryBytes = Math.max(0, (raw.memory_stats?.usage ?? 0) - cache);
  const memoryLimitBytes = raw.memory_stats?.limit ?? 0;

  let rx = 0;
  let tx = 0;
  for (const iface of Object.values(raw.networks ?? {})) {
    rx += iface.rx_bytes ?? 0;
    tx += iface.tx_bytes ?? 0;
  }

  return {
    cpuPercent: Math.round(cpuPercent * 10) / 10,
    memoryBytes,
    memoryLimitBytes,
    memoryPercent: memoryLimitBytes > 0 ? Math.round((memoryBytes / memoryLimitBytes) * 1000) / 10 : 0,
    netRxBytes: rx,
    netTxBytes: tx,
    sampledAt: new Date().toISOString(),
  };
}
