import { histogramQuantile, parseNumber, parsePrometheus, type MetricSample } from './prometheus.js';
import { routerName } from '../docker/labels.js';
import { withTimeout } from '../timeout.js';

/**
 * Per-app traffic, read from Traefik.
 *
 * Traefik's counters only ever go up, and they reset when it restarts. To show
 * a shape over time, this takes a sample every half minute and keeps the
 * differences. The window lives in memory: losing it on restart costs a graph,
 * not data anyone relies on.
 */

export const SAMPLE_INTERVAL_MS = 30_000;
/** Two hours at one sample every thirty seconds. */
export const WINDOW = 240;

export interface TrafficPoint {
  at: string;
  requests: number;
  bytes: number;
}

export interface StatusCount {
  code: string;
  requests: number;
}

export interface AppTraffic {
  /** Since Traefik last started, not since the app was created. */
  totalRequests: number;
  totalBytes: number;
  byStatus: StatusCount[];
  p50Ms: number | null;
  p95Ms: number | null;
  /** Oldest first. Empty until two samples have been taken. */
  series: TrafficPoint[];
  /** False when Traefik has no metrics for this app yet. */
  seen: boolean;
  sampledAt: string | null;
}

interface RouterTotals {
  requests: number;
  bytes: number;
  byStatus: Map<string, number>;
  buckets: { le: number; count: number }[];
}

function labelOf(sample: MetricSample, key: string): string {
  return sample.labels[key] ?? '';
}

/** `rig-hello@docker` and `rig-hello` both mean the app called `hello`. */
function routerKey(raw: string): string {
  return raw.split('@')[0] ?? raw;
}

export function readTotals(body: string): Map<string, RouterTotals> {
  const byRouter = new Map<string, RouterTotals>();

  const ensure = (router: string): RouterTotals => {
    let totals = byRouter.get(router);
    if (!totals) {
      totals = { requests: 0, bytes: 0, byStatus: new Map(), buckets: [] };
      byRouter.set(router, totals);
    }
    return totals;
  };

  for (const sample of parsePrometheus(body)) {
    const router = routerKey(labelOf(sample, 'router'));
    if (!router) continue;

    switch (sample.name) {
      case 'traefik_router_requests_total': {
        const totals = ensure(router);
        totals.requests += sample.value;
        const code = labelOf(sample, 'code') || 'unknown';
        totals.byStatus.set(code, (totals.byStatus.get(code) ?? 0) + sample.value);
        break;
      }
      case 'traefik_router_responses_bytes_total': {
        ensure(router).bytes += sample.value;
        break;
      }
      case 'traefik_router_request_duration_seconds_bucket': {
        const le = parseNumber(labelOf(sample, 'le') || 'NaN');
        if (Number.isNaN(le)) break;
        const totals = ensure(router);
        const existing = totals.buckets.find((b) => b.le === le);
        if (existing) existing.count += sample.value;
        else totals.buckets.push({ le, count: sample.value });
        break;
      }
      default:
        break;
    }
  }

  return byRouter;
}

interface Tracked {
  last: RouterTotals;
  points: TrafficPoint[];
  sampledAt: number;
}

export class TrafficCollector {
  private tracked = new Map<string, Tracked>();
  private timer: NodeJS.Timeout | null = null;
  private lastError: string | null = null;

  constructor(
    private readonly metricsUrl: string,
    private readonly log: { warn: (o: unknown, m?: string) => void },
  ) {}

  get enabled(): boolean {
    return this.metricsUrl.length > 0;
  }

  start(): void {
    if (!this.enabled || this.timer) return;
    void this.sample();
    this.timer = setInterval(() => void this.sample(), SAMPLE_INTERVAL_MS);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async sample(): Promise<void> {
    if (!this.enabled) return;
    let body: string;
    try {
      const response = await withTimeout(
        'Traefik metrics',
        5_000,
        fetch(this.metricsUrl, { signal: AbortSignal.timeout(5_000) }),
      );
      if (!response.ok) throw new Error(`Traefik answered ${response.status}`);
      body = await response.text();
      this.lastError = null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Only say so once per spell, rather than every thirty seconds forever.
      if (this.lastError !== message) {
        this.lastError = message;
        this.log.warn({ error: message }, 'could not read Traefik metrics');
      }
      return;
    }

    const now = Date.now();
    const fresh = readTotals(body);

    for (const [router, totals] of fresh) {
      const previous = this.tracked.get(router);
      if (!previous) {
        this.tracked.set(router, { last: totals, points: [], sampledAt: now });
        continue;
      }
      // A restart resets the counters, which shows up as a drop. Treat that as
      // a fresh start rather than plotting a negative spike.
      const requests = totals.requests >= previous.last.requests ? totals.requests - previous.last.requests : totals.requests;
      const bytes = totals.bytes >= previous.last.bytes ? totals.bytes - previous.last.bytes : totals.bytes;

      previous.points.push({ at: new Date(now).toISOString(), requests, bytes });
      if (previous.points.length > WINDOW) previous.points = previous.points.slice(-WINDOW);
      previous.last = totals;
      previous.sampledAt = now;
    }

    // An app that was deleted stops appearing; drop it so the map cannot grow
    // without bound.
    for (const router of [...this.tracked.keys()]) {
      if (!fresh.has(router)) this.tracked.delete(router);
    }
  }

  forApp(appName: string): AppTraffic {
    const tracked = this.tracked.get(routerName(appName));
    if (!tracked) {
      return {
        totalRequests: 0,
        totalBytes: 0,
        byStatus: [],
        p50Ms: null,
        p95Ms: null,
        series: [],
        seen: false,
        sampledAt: null,
      };
    }

    const { last } = tracked;
    const p50 = histogramQuantile(last.buckets, 0.5);
    const p95 = histogramQuantile(last.buckets, 0.95);

    return {
      totalRequests: last.requests,
      totalBytes: last.bytes,
      byStatus: [...last.byStatus.entries()]
        .map(([code, requests]) => ({ code, requests }))
        .sort((a, b) => b.requests - a.requests || a.code.localeCompare(b.code)),
      p50Ms: p50 === null ? null : Math.round(p50 * 1000),
      p95Ms: p95 === null ? null : Math.round(p95 * 1000),
      series: [...tracked.points],
      seen: true,
      sampledAt: new Date(tracked.sampledAt).toISOString(),
    };
  }

  forget(appName: string): void {
    this.tracked.delete(routerName(appName));
  }
}
