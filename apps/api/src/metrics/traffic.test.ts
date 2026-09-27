import { describe, expect, it } from 'vitest';
import { histogramQuantile, parsePrometheus } from './prometheus.js';
import { readTotals } from './traffic.js';

/** Copied from a running Traefik, trimmed to the lines Rig reads. */
const TRAEFIK_OUTPUT = `
# HELP traefik_router_requests_total How many HTTP requests processed on a router.
# TYPE traefik_router_requests_total counter
traefik_router_requests_total{code="200",method="GET",protocol="http",router="rig-lumen@docker",service="rig-lumen@docker"} 15
traefik_router_requests_total{code="404",method="GET",protocol="http",router="rig-pet@docker",service="rig-pet@docker"} 5
traefik_router_requests_total{code="500",method="POST",protocol="http",router="rig-lumen@docker",service="rig-lumen@docker"} 2
# HELP traefik_router_responses_bytes_total The total size of HTTP responses in bytes handled by a router.
# TYPE traefik_router_responses_bytes_total counter
traefik_router_responses_bytes_total{code="200",method="GET",protocol="http",router="rig-lumen@docker",service="rig-lumen@docker"} 7065
traefik_router_responses_bytes_total{code="404",method="GET",protocol="http",router="rig-pet@docker",service="rig-pet@docker"} 695
# TYPE traefik_router_request_duration_seconds histogram
traefik_router_request_duration_seconds_bucket{code="200",method="GET",protocol="http",router="rig-lumen@docker",service="rig-lumen@docker",le="0.1"} 12
traefik_router_request_duration_seconds_bucket{code="200",method="GET",protocol="http",router="rig-lumen@docker",service="rig-lumen@docker",le="0.3"} 15
traefik_router_request_duration_seconds_bucket{code="200",method="GET",protocol="http",router="rig-lumen@docker",service="rig-lumen@docker",le="+Inf"} 15
# These belong to Traefik itself, not to an app.
traefik_entrypoint_requests_total{code="200",entrypoint="web",method="GET",protocol="http"} 40
`;

describe('parsePrometheus', () => {
  it('reads a name, its labels and its value', () => {
    const samples = parsePrometheus('some_metric{a="1",b="two"} 3.5');
    expect(samples).toEqual([{ name: 'some_metric', labels: { a: '1', b: 'two' }, value: 3.5 }]);
  });

  it('skips comments and blank lines', () => {
    expect(parsePrometheus('# HELP x\n# TYPE x counter\n\n')).toEqual([]);
  });

  it('handles a metric with no labels', () => {
    expect(parsePrometheus('up 1')).toEqual([{ name: 'up', labels: {}, value: 1 }]);
  });

  it('understands the infinity bucket', () => {
    const [sample] = parsePrometheus('h_bucket{le="+Inf"} 9');
    expect(sample?.value).toBe(9);
    expect(sample?.labels.le).toBe('+Inf');
  });

  it('ignores a trailing timestamp', () => {
    const [sample] = parsePrometheus('some_metric 7 1595040000000');
    expect(sample?.value).toBe(7);
  });

  it('does not fall over on a label value containing a quote or a comma', () => {
    const [sample] = parsePrometheus('m{rule="Host(\\"a.test\\")",other="x,y"} 1');
    expect(sample?.labels.rule).toBe('Host("a.test")');
    expect(sample?.labels.other).toBe('x,y');
  });
});

describe('readTotals', () => {
  const totals = readTotals(TRAEFIK_OUTPUT);

  it('groups by app, ignoring the @docker suffix', () => {
    expect([...totals.keys()].sort()).toEqual(['rig-lumen', 'rig-pet']);
  });

  it('adds up every status code for an app', () => {
    expect(totals.get('rig-lumen')?.requests).toBe(17);
    expect(totals.get('rig-pet')?.requests).toBe(5);
  });

  it('keeps the split by status code', () => {
    const lumen = totals.get('rig-lumen')!;
    expect(lumen.byStatus.get('200')).toBe(15);
    expect(lumen.byStatus.get('500')).toBe(2);
  });

  it('adds up the bytes served', () => {
    expect(totals.get('rig-lumen')?.bytes).toBe(7065);
  });

  it('leaves out metrics that are not about an app', () => {
    // traefik_entrypoint_requests_total carries no router label.
    expect(totals.has('')).toBe(false);
    expect([...totals.keys()]).not.toContain('web');
  });

  it('collects the latency buckets', () => {
    const buckets = totals.get('rig-lumen')?.buckets ?? [];
    expect(buckets.find((b) => b.le === 0.1)?.count).toBe(12);
    expect(buckets.find((b) => !Number.isFinite(b.le))?.count).toBe(15);
  });

  it('returns nothing for a body with no metrics in it', () => {
    expect(readTotals('').size).toBe(0);
    expect(readTotals('# nothing here').size).toBe(0);
  });
});

describe('histogramQuantile', () => {
  const buckets = [
    { le: 0.1, count: 12 },
    { le: 0.3, count: 15 },
    { le: Number.POSITIVE_INFINITY, count: 15 },
  ];

  it('finds the median inside the bucket it falls in', () => {
    // Half of 15 is 7.5, which is inside the first bucket.
    const p50 = histogramQuantile(buckets, 0.5);
    expect(p50).toBeGreaterThan(0);
    expect(p50).toBeLessThanOrEqual(0.1);
  });

  it('puts a high quantile in the slower bucket', () => {
    const p95 = histogramQuantile(buckets, 0.95);
    expect(p95).toBeGreaterThan(0.1);
    expect(p95).toBeLessThanOrEqual(0.3);
  });

  it('says nothing rather than zero when there is no traffic', () => {
    expect(histogramQuantile([], 0.5)).toBeNull();
    expect(histogramQuantile([{ le: Number.POSITIVE_INFINITY, count: 0 }], 0.5)).toBeNull();
  });

  it('does not invent a number when everything is in the overflow bucket', () => {
    expect(histogramQuantile([{ le: Number.POSITIVE_INFINITY, count: 5 }], 0.5)).toBeNull();
  });
});
