import { describe, expect, it } from 'vitest';
import { ALLOWED_CAPABILITIES, appLabels, containerName, containerSpec, PIDS_LIMIT } from './labels.js';

const base = {
  appId: '11111111-2222-3333-4444-555555555555',
  appName: 'hello',
  domain: 'tobipi.dev',
  internalPort: 80,
  network: 'rig_apps',
  entrypoint: 'web',
};

describe('appLabels', () => {
  it('routes the app hostname to its internal port', () => {
    const labels = appLabels(base);
    expect(labels['traefik.enable']).toBe('true');
    expect(labels['traefik.http.routers.rig-hello.rule']).toBe('Host(`hello.tobipi.dev`)');
    expect(labels['traefik.http.services.rig-hello.loadbalancer.server.port']).toBe('80');
    expect(labels['traefik.docker.network']).toBe('rig_apps');
  });

  it('tags the container so the reconciler can recognise its own work', () => {
    const labels = appLabels(base);
    expect(labels['rig.managed']).toBe('true');
    expect(labels['rig.app_id']).toBe(base.appId);
    expect(labels['rig.app_name']).toBe('hello');
  });

  it('gives each app its own router so two apps cannot collide', () => {
    const a = appLabels(base);
    const b = appLabels({ ...base, appName: 'other' });
    expect(Object.keys(a)).not.toEqual(Object.keys(b));
    expect(b['traefik.http.routers.rig-other.rule']).toBe('Host(`other.tobipi.dev`)');
  });
});

describe('containerSpec', () => {
  const spec = containerSpec({ ...base, image: 'nginxdemos/hello', env: { A: '1' }, memoryMb: 256, cpuCores: 0.5 });

  it('never publishes a host port', () => {
    expect(spec.HostConfig?.PortBindings).toEqual({});
    expect(spec.HostConfig?.PublishAllPorts).toBe(false);
  });

  it('never mounts anything from the host', () => {
    expect(spec.HostConfig?.Binds).toEqual([]);
  });

  it('caps memory, cpu and processes', () => {
    expect(spec.HostConfig?.Memory).toBe(256 * 1024 * 1024);
    expect(spec.HostConfig?.MemorySwap).toBe(spec.HostConfig?.Memory);
    expect(spec.HostConfig?.NanoCpus).toBe(500_000_000);
    expect(spec.HostConfig?.PidsLimit).toBe(PIDS_LIMIT);
  });

  it('drops every capability and adds back only what ordinary web images need', () => {
    expect(spec.HostConfig?.CapDrop).toEqual(['ALL']);
    expect(spec.HostConfig?.CapAdd).toEqual([...ALLOWED_CAPABILITIES]);
    for (const dangerous of ['SYS_ADMIN', 'NET_RAW', 'NET_ADMIN', 'MKNOD', 'SYS_MODULE']) {
      expect(spec.HostConfig?.CapAdd).not.toContain(dangerous);
    }
  });

  it('refuses extra privileges, spelling the value out', () => {
    expect(spec.HostConfig?.SecurityOpt).toEqual(['no-new-privileges:true']);
    expect(spec.HostConfig?.Privileged).toBe(false);
  });

  it('caps the log size so one app cannot fill the disk', () => {
    expect(spec.HostConfig?.LogConfig?.Config?.['max-size']).toBe('10m');
  });

  it('restarts on its own after a reboot', () => {
    expect(spec.HostConfig?.RestartPolicy?.Name).toBe('unless-stopped');
  });

  it('joins only the apps network', () => {
    expect(spec.HostConfig?.NetworkMode).toBe('rig_apps');
    expect(Object.keys(spec.NetworkingConfig?.EndpointsConfig ?? {})).toEqual(['rig_apps']);
  });

  it('passes the environment through as docker expects', () => {
    expect(spec.Env).toEqual(['A=1']);
    expect(spec.name).toBe(containerName('hello'));
  });

  it('rounds fractional cpu to whole nanocpus', () => {
    const third = containerSpec({ ...base, image: 'x', env: {}, memoryMb: 100, cpuCores: 0.1 });
    expect(third.HostConfig?.NanoCpus).toBe(100_000_000);
  });
});
