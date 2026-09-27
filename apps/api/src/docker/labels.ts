import type Dockerode from 'dockerode';

/** Marks a container as one Rig created, so the reconciler can find its own work. */
export const MANAGED_LABEL = 'rig.managed';
export const APP_ID_LABEL = 'rig.app_id';
export const APP_NAME_LABEL = 'rig.app_name';

/**
 * Dropping every capability is the safe default, but it breaks common images:
 * nginx, for one, starts as root and needs to hand its workers to an unprivileged
 * user. These are added back so ordinary web images run, while the dangerous
 * capabilities (raw sockets, kernel modules, device nodes, admin) stay gone.
 */
export const ALLOWED_CAPABILITIES = [
  'CHOWN',
  'DAC_OVERRIDE',
  'FOWNER',
  'FSETID',
  'KILL',
  'NET_BIND_SERVICE',
  'SETGID',
  'SETUID',
] as const;

export const PIDS_LIMIT = 256;

export function containerName(appName: string): string {
  return `rig-${appName}`;
}

export function routerName(appName: string): string {
  return `rig-${appName}`;
}

export interface LabelInput {
  appId: string;
  appName: string;
  domain: string;
  internalPort: number;
  network: string;
  entrypoint: string;
}

/**
 * The labels Traefik reads to publish an app. Because routing comes from these
 * labels, deleting the container is all it takes for the URL to stop resolving.
 */
export function appLabels(input: LabelInput): Record<string, string> {
  const router = routerName(input.appName);
  return {
    [MANAGED_LABEL]: 'true',
    [APP_ID_LABEL]: input.appId,
    [APP_NAME_LABEL]: input.appName,
    'traefik.enable': 'true',
    'traefik.docker.network': input.network,
    [`traefik.http.routers.${router}.rule`]: `Host(\`${input.appName}.${input.domain}\`)`,
    [`traefik.http.routers.${router}.entrypoints`]: input.entrypoint,
    [`traefik.http.routers.${router}.service`]: router,
    [`traefik.http.services.${router}.loadbalancer.server.port`]: String(input.internalPort),
  };
}

export interface ContainerSpecInput extends LabelInput {
  image: string;
  env: Record<string, string>;
  memoryMb: number;
  cpuCores: number;
}

/**
 * Every container Rig starts gets the same treatment: no host ports, no bind
 * mounts, no extra privileges, capped memory, CPU, processes and log size, and
 * only the network Traefik shares with apps.
 */
export function containerSpec(input: ContainerSpecInput): Dockerode.ContainerCreateOptions {
  const memoryBytes = Math.round(input.memoryMb * 1024 * 1024);
  return {
    name: containerName(input.appName),
    Image: input.image,
    Env: Object.entries(input.env).map(([k, v]) => `${k}=${v}`),
    Labels: appLabels(input),
    // Nothing is published on the host. Traffic only arrives through Traefik.
    ExposedPorts: { [`${input.internalPort}/tcp`]: {} },
    HostConfig: {
      NetworkMode: input.network,
      PortBindings: {},
      PublishAllPorts: false,
      Binds: [],
      RestartPolicy: { Name: 'unless-stopped' },
      Memory: memoryBytes,
      // Equal to Memory, which switches swap off for the container.
      MemorySwap: memoryBytes,
      NanoCpus: Math.round(input.cpuCores * 1e9),
      PidsLimit: PIDS_LIMIT,
      CapDrop: ['ALL'],
      CapAdd: [...ALLOWED_CAPABILITIES],
      SecurityOpt: ['no-new-privileges'],
      Privileged: false,
      // Keeps one noisy app from filling the Pi's SD card.
      LogConfig: { Type: 'json-file', Config: { 'max-size': '10m', 'max-file': '3' } },
    },
    NetworkingConfig: {
      EndpointsConfig: {
        [input.network]: { Aliases: [input.appName] },
      },
    },
  };
}
