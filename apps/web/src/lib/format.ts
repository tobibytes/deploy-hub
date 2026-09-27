import type { EventAction } from '@rig/shared/client';

export function bytes(value: number): string {
  if (value <= 0) return '0 MB';
  const mb = value / (1024 * 1024);
  if (mb < 1) return `${Math.round(value / 1024)} KB`;
  if (mb < 1024) return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

export function when(iso: string): string {
  const then = new Date(iso).getTime();
  const seconds = Math.round((Date.now() - then) / 1000);
  if (seconds < 45) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function dateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const ACTION_WORDS: Record<EventAction, string> = {
  create: 'Created',
  deploy: 'Deployed',
  start: 'Started',
  stop: 'Stopped',
  restart: 'Restarted',
  redeploy: 'Redeployed',
  env_change: 'Changed the environment',
  limits_change: 'Changed the settings',
  delete: 'Deleted',
  reconcile: 'Checked against Docker',
};

export function actionWords(action: EventAction): string {
  return ACTION_WORDS[action] ?? action;
}

/** Joins an event message to its timestamp without ending up with two full stops. */
export function withTime(message: string | null, iso: string): string {
  if (!message) return dateTime(iso);
  const trimmed = message.trim().replace(/[.\s]+$/, '');
  return `${trimmed}. ${dateTime(iso)}`;
}

export function cpuLabel(cores: number): string {
  return `${cores} core${cores === 1 ? '' : 's'}`;
}
