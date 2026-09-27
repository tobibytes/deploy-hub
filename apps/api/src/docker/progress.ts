/**
 * Live deploy progress, kept in memory so the New app screen can show the steps
 * as they happen. The durable record of what happened lives in the events table;
 * this is only the in-flight view, and losing it on restart is fine.
 */

export const DEPLOY_STEPS = ['pull', 'create', 'start', 'route', 'live'] as const;
export type DeployStep = (typeof DEPLOY_STEPS)[number];

export const STEP_LABELS: Record<DeployStep, string> = {
  pull: 'Pulling image',
  create: 'Creating container',
  start: 'Starting',
  route: 'Routing',
  live: 'Live',
};

export type StepState = 'waiting' | 'active' | 'done' | 'failed';

export interface StepView {
  step: DeployStep;
  label: string;
  state: StepState;
  detail: string | null;
}

export interface ProgressView {
  appId: string;
  steps: StepView[];
  finishedAt: string | null;
  error: string | null;
}

const KEEP_MS = 5 * 60 * 1000;

export class DeployProgress {
  private runs = new Map<string, { steps: StepView[]; finishedAt: number | null; error: string | null }>();

  begin(appId: string): void {
    this.runs.set(appId, {
      steps: DEPLOY_STEPS.map((step) => ({ step, label: STEP_LABELS[step], state: 'waiting', detail: null })),
      finishedAt: null,
      error: null,
    });
    this.sweep();
  }

  set(appId: string, step: DeployStep, state: StepState, detail?: string): void {
    const run = this.runs.get(appId);
    if (!run) return;
    const index = DEPLOY_STEPS.indexOf(step);
    const entry = run.steps[index];
    if (!entry) return;
    entry.state = state;
    if (detail !== undefined) entry.detail = detail;
    // Anything before the active step has necessarily finished.
    if (state !== 'waiting') {
      for (let i = 0; i < index; i++) {
        const earlier = run.steps[i];
        if (earlier && earlier.state !== 'failed') earlier.state = 'done';
      }
    }
  }

  finish(appId: string, error?: string): void {
    const run = this.runs.get(appId);
    if (!run) return;
    run.finishedAt = Date.now();
    run.error = error ?? null;
    if (!error) run.steps.forEach((s) => (s.state = 'done'));
  }

  get(appId: string): ProgressView | null {
    const run = this.runs.get(appId);
    if (!run) return null;
    return {
      appId,
      steps: run.steps.map((s) => ({ ...s })),
      finishedAt: run.finishedAt ? new Date(run.finishedAt).toISOString() : null,
      error: run.error,
    };
  }

  forget(appId: string): void {
    this.runs.delete(appId);
  }

  private sweep(): void {
    const cutoff = Date.now() - KEEP_MS;
    for (const [id, run] of this.runs) {
      if (run.finishedAt !== null && run.finishedAt < cutoff) this.runs.delete(id);
    }
  }
}
