import type {
  App,
  AppDetail,
  AppEvent,
  AppStats,
  CreateAppInput,
  HealthReport,
  Me,
  UpdateAppInput,
} from '@rig/shared/client';

/** The message the API sent, so forms can show the real reason. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly field?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, init?: RequestInit, readBodyOn: number[] = []): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      credentials: 'same-origin',
      headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
      ...init,
    });
  } catch {
    throw new ApiError('Cannot reach the server. Check that Rig is running.', 0);
  }

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const body: unknown = text ? safeJson(text) : null;

  if (!response.ok && !readBodyOn.includes(response.status)) {
    const shaped = body as { error?: string; field?: string } | null;
    throw new ApiError(shaped?.error ?? `The server answered ${response.status}.`, response.status, shaped?.field);
  }
  return body as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { error: text.slice(0, 200) };
  }
}

export interface ServerInfo {
  domain: string;
  platform: string;
  reservedNames: string[];
  ownerEmail: string;
  limits: { memory: { min: number; max: number; default: number }; cpu: { min: number; max: number; default: number } };
}

export interface DeployProgressView {
  appId: string;
  steps: { step: string; label: string; state: 'waiting' | 'active' | 'done' | 'failed'; detail: string | null }[];
  finishedAt: string | null;
  error: string | null;
}

export type ActivityEntry = AppEvent & { appName: string | null; appId: string | null };

export interface AppTraffic {
  enabled: boolean;
  /** Present when enabled is false. */
  reason?: string;
  totalRequests: number;
  totalBytes: number;
  byStatus: { code: string; requests: number }[];
  p50Ms: number | null;
  p95Ms: number | null;
  series: { at: string; requests: number; bytes: number }[];
  seen: boolean;
  sampledAt: string | null;
}

export const api = {
  /* auth */
  me: () => request<Me>('/auth/me'),
  login: (email: string, password: string) =>
    request<Me>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  logout: () => request<{ ok: true }>('/auth/logout', { method: 'POST' }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: true }>('/auth/password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
  logoutEverywhere: () => request<{ ok: true }>('/auth/logout-everywhere', { method: 'POST' }),

  /* server */
  serverInfo: () => request<ServerInfo>('/server-info'),
  // A failing health check answers 503 with the full report, which is exactly
  // what the interface needs to show, so it is read rather than thrown away.
  health: () => request<HealthReport>('/health', undefined, [503]),

  /* apps */
  apps: () => request<App[]>('/apps'),
  app: (id: string) => request<AppDetail>(`/apps/${id}`),
  createApp: (input: CreateAppInput) => request<App>('/apps', { method: 'POST', body: JSON.stringify(input) }),
  updateApp: (id: string, input: UpdateAppInput) =>
    request<App>(`/apps/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  deleteApp: (id: string) => request<void>(`/apps/${id}`, { method: 'DELETE' }),
  start: (id: string) => request<App>(`/apps/${id}/start`, { method: 'POST' }),
  stop: (id: string) => request<App>(`/apps/${id}/stop`, { method: 'POST' }),
  restart: (id: string) => request<App>(`/apps/${id}/restart`, { method: 'POST' }),
  redeploy: (id: string) => request<App>(`/apps/${id}/redeploy`, { method: 'POST' }),
  progress: (id: string) => request<DeployProgressView>(`/apps/${id}/progress`),
  stats: (id: string) => request<AppStats>(`/apps/${id}/stats`),
  traffic: (id: string) => request<AppTraffic>(`/apps/${id}/traffic`),
  activity: () => request<ActivityEntry[]>('/activity'),
};

/**
 * Live logs over Server Sent Events. Returns a stop function, and reports errors
 * through the callback rather than throwing into the render.
 */
export function streamLogs(
  appId: string,
  onLine: (line: string) => void,
  onError: (message: string) => void,
): () => void {
  const source = new EventSource(`/api/apps/${appId}/logs`);

  source.onmessage = (event: MessageEvent<string>) => {
    try {
      onLine(JSON.parse(event.data) as string);
    } catch {
      onLine(event.data);
    }
  };
  source.addEventListener('error', (event) => {
    const data = (event as MessageEvent<string>).data;
    if (data) {
      try {
        onError((JSON.parse(data) as { error?: string }).error ?? 'The log stream stopped.');
        return;
      } catch {
        /* fall through to the generic message */
      }
    }
    // EventSource reconnects on its own, so only say something once it is closed.
    if (source.readyState === EventSource.CLOSED) onError('The log stream stopped. Reload to try again.');
  });
  source.addEventListener('end', () => source.close());

  return () => source.close();
}
