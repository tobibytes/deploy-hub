/** Values both sides need, kept free of zod so the browser bundle stays small. */

export const MEMORY_MB = { min: 64, max: 1024, default: 256 } as const;
export const CPU_CORES = { min: 0.1, max: 2, default: 0.5 } as const;

export const appStatuses = ['deploying', 'running', 'stopped', 'failed'] as const;
export type AppStatus = (typeof appStatuses)[number];

export const eventActions = [
  'create',
  'deploy',
  'start',
  'stop',
  'restart',
  'redeploy',
  'env_change',
  'limits_change',
  'delete',
  'reconcile',
] as const;
export type EventAction = (typeof eventActions)[number];
