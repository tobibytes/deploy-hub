import Dockerode from 'dockerode';
import type { Config } from '../config.js';

export type Docker = Dockerode;

/**
 * In Compose, Rig talks to a read-restricted socket proxy over TCP and never
 * holds `/var/run/docker.sock` itself. Locally, pointing straight at the socket
 * is simpler, so both are supported.
 */
export function createDocker(cfg: Config): Docker {
  // Pulls and log streams are long lived, so this only bounds how long a single
  // socket may sit idle, not how long an operation may take.
  const timeout = 30_000;
  if (cfg.DOCKER_HOST_URL) {
    const url = new URL(cfg.DOCKER_HOST_URL);
    return new Dockerode({
      protocol: url.protocol.replace(':', '') as 'http' | 'https',
      host: url.hostname,
      port: Number(url.port || (url.protocol === 'https:' ? 443 : 80)),
      timeout,
    });
  }
  return new Dockerode({ socketPath: cfg.DOCKER_SOCKET_PATH, timeout });
}

/** `linux/arm64` on the Pi, `linux/amd64` on most laptops. */
export async function hostPlatform(docker: Docker): Promise<string> {
  const info = (await docker.info()) as { Architecture?: string; OSType?: string };
  const os = info.OSType ?? 'linux';
  switch (info.Architecture) {
    case 'aarch64':
    case 'arm64':
      return `${os}/arm64`;
    case 'x86_64':
    case 'amd64':
      return `${os}/amd64`;
    case 'armv7l':
      return `${os}/arm/v7`;
    default:
      return `${os}/${info.Architecture ?? 'amd64'}`;
  }
}

export class ImagePlatformError extends Error {
  constructor(image: string, platform: string) {
    super(
      `The image "${image}" has no ${platform} version, so it cannot run on this server. ` +
        `Pick an image that publishes a ${platform} build, or build one yourself.`,
    );
    this.name = 'ImagePlatformError';
  }
}

/** True when Docker's pull failure was "this image has no build for our CPU". */
export function isPlatformMismatch(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('no matching manifest') ||
    m.includes('no match for platform') ||
    m.includes('cannot be used on this platform') ||
    (m.includes('platform') && m.includes('not found'))
  );
}

export interface PullProgress {
  (line: string): void;
}

/**
 * Pulls an image for this machine's CPU and resolves once Docker is done.
 * Progress lines are passed through so the dashboard can show them live.
 */
export async function pullImage(
  docker: Docker,
  image: string,
  platform: string,
  onProgress?: PullProgress,
): Promise<void> {
  const ref = image.includes(':') || image.includes('@') ? image : `${image}:latest`;
  const stream = await new Promise<NodeJS.ReadableStream>((resolve, reject) => {
    docker.pull(ref, { platform }, (err, s) => {
      if (err || !s) reject(err ?? new Error(`Could not start pulling ${ref}.`));
      else resolve(s);
    });
  });

  await new Promise<void>((resolve, reject) => {
    docker.modem.followProgress(
      stream,
      (err) => {
        if (!err) return resolve();
        const message = err instanceof Error ? err.message : String(err);
        reject(isPlatformMismatch(message) ? new ImagePlatformError(ref, platform) : new Error(message));
      },
      (event: { status?: string; progress?: string; error?: string }) => {
        if (!onProgress) return;
        const text = [event.status, event.progress].filter(Boolean).join(' ');
        if (text) onProgress(text);
      },
    );
  }).catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    if (isPlatformMismatch(message)) throw new ImagePlatformError(ref, platform);
    throw error instanceof Error ? error : new Error(message);
  });
}

/** Creates the apps network if it is not there yet, so a fresh host just works. */
export async function ensureNetwork(docker: Docker, name: string): Promise<void> {
  const networks = await docker.listNetworks({ filters: { name: [name] } });
  if (networks.some((n) => n.Name === name)) return;
  await docker.createNetwork({ Name: name, Driver: 'bridge', Attachable: true });
}
