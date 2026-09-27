import { describe, expect, it } from 'vitest';
import { mapStatus, readStats } from './engine.js';

describe('mapStatus', () => {
  it('reads a running container as running', () => {
    expect(mapStatus('running', 'Up 3 minutes')).toBe('running');
  });

  it('treats a clean exit as stopped and a crash as failed', () => {
    expect(mapStatus('exited', 'Exited (0) 2 seconds ago')).toBe('stopped');
    expect(mapStatus('exited', 'Exited (1) 2 seconds ago')).toBe('failed');
    expect(mapStatus('exited', 'Exited (137) 1 minute ago')).toBe('failed');
  });

  it('shows a container still coming up as deploying', () => {
    expect(mapStatus('created', 'Created')).toBe('deploying');
    expect(mapStatus('restarting', 'Restarting (1)')).toBe('deploying');
  });

  it('falls back to stopped for anything it does not know', () => {
    expect(mapStatus(undefined, undefined)).toBe('stopped');
    expect(mapStatus('paused', 'Paused')).toBe('stopped');
  });
});

describe('readStats', () => {
  it('works out cpu percent across cores', () => {
    const stats = readStats({
      cpu_stats: { cpu_usage: { total_usage: 200 }, system_cpu_usage: 1000, online_cpus: 4 },
      precpu_stats: { cpu_usage: { total_usage: 100 }, system_cpu_usage: 900 },
      memory_stats: { usage: 0, limit: 0 },
    });
    // 100 of 100 system ticks across 4 cores.
    expect(stats.cpuPercent).toBe(400);
  });

  it('reports zero rather than infinity on the first sample', () => {
    const stats = readStats({
      cpu_stats: { cpu_usage: { total_usage: 100 }, system_cpu_usage: 0, online_cpus: 1 },
      precpu_stats: {},
      memory_stats: {},
    });
    expect(stats.cpuPercent).toBe(0);
    expect(stats.memoryPercent).toBe(0);
  });

  it('takes reclaimable page cache out of the memory figure', () => {
    const stats = readStats({
      memory_stats: { usage: 100 * 1024 * 1024, limit: 256 * 1024 * 1024, stats: { inactive_file: 40 * 1024 * 1024 } },
    });
    expect(stats.memoryBytes).toBe(60 * 1024 * 1024);
    expect(stats.memoryPercent).toBeCloseTo(23.4, 1);
  });

  it('adds up every network interface', () => {
    const stats = readStats({
      networks: { eth0: { rx_bytes: 10, tx_bytes: 20 }, eth1: { rx_bytes: 5, tx_bytes: 5 } },
    });
    expect(stats.netRxBytes).toBe(15);
    expect(stats.netTxBytes).toBe(25);
  });
});
