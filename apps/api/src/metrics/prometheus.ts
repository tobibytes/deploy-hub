/**
 * Just enough of the Prometheus text format to read Traefik's metrics.
 *
 * Traefik is already counting every request it routes, labelled by router, and
 * Rig names each router after its app. So the numbers the dashboard needs are
 * there for the asking, with nothing added to the apps themselves and no
 * third party involved.
 */

export interface MetricSample {
  name: string;
  labels: Record<string, string>;
  value: number;
}

const LINE = /^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{(.*)\})?\s+(.+)$/;

/** Splits `a="1",b="2"` while leaving escaped quotes inside a value alone. */
function parseLabels(raw: string): Record<string, string> {
  const labels: Record<string, string> = {};
  const pattern = /([a-zA-Z_][a-zA-Z0-9_]*)="((?:[^"\\]|\\.)*)"/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(raw)) !== null) {
    const [, key, value] = match;
    if (key === undefined || value === undefined) continue;
    labels[key] = value.replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
  }
  return labels;
}

/** `Number('+Inf')` is NaN, but Prometheus writes bucket bounds exactly that way. */
export function parseNumber(text: string): number {
  switch (text.trim()) {
    case '+Inf':
    case 'Inf':
      return Number.POSITIVE_INFINITY;
    case '-Inf':
      return Number.NEGATIVE_INFINITY;
    case 'NaN':
      return Number.NaN;
    default:
      return Number(text);
  }
}

function parseValue(raw: string): number {
  // A trailing timestamp is allowed and is not part of the value.
  return parseNumber(raw.trim().split(/\s+/)[0] ?? '');
}

export function parsePrometheus(body: string): MetricSample[] {
  const samples: MetricSample[] = [];
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    // Comments carry HELP and TYPE, which this does not need.
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = LINE.exec(trimmed);
    if (!match) continue;
    const [, name, , rawLabels, rawValue] = match;
    if (!name || rawValue === undefined) continue;
    const value = parseValue(rawValue);
    if (Number.isNaN(value)) continue;
    samples.push({ name, labels: rawLabels ? parseLabels(rawLabels) : {}, value });
  }
  return samples;
}

/**
 * The quantile of a Prometheus histogram, interpolating inside the bucket the
 * quantile falls in. Buckets are cumulative and the last one is +Inf.
 */
export function histogramQuantile(
  buckets: { le: number; count: number }[],
  quantile: number,
): number | null {
  const sorted = [...buckets].sort((a, b) => a.le - b.le);
  const total = sorted.at(-1)?.count ?? 0;
  if (total <= 0 || sorted.length === 0) return null;

  const target = quantile * total;
  let previousLe = 0;
  let previousCount = 0;

  for (const bucket of sorted) {
    if (bucket.count >= target) {
      // Everything is in the overflow bucket, so the best answer is its floor.
      if (!Number.isFinite(bucket.le)) return previousLe > 0 ? previousLe : null;
      const span = bucket.count - previousCount;
      if (span <= 0) return bucket.le;
      const within = (target - previousCount) / span;
      return previousLe + (bucket.le - previousLe) * within;
    }
    previousLe = Number.isFinite(bucket.le) ? bucket.le : previousLe;
    previousCount = bucket.count;
  }
  return sorted.at(-1)?.le ?? null;
}
