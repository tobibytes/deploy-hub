import type { AppStatus, EventAction } from './limits.js';

/* ---------- requests ----------
   Declared as plain types so the browser can import them without pulling zod
   in. `schemas.ts` checks that its zod schemas still produce exactly these. */

export interface LoginInput {
  email: string;
  password: string;
}

export interface CreateAppInput {
  name: string;
  image: string;
  internalPort: number;
  env: Record<string, string>;
  memoryMb: number;
  cpuCores: number;
}

export interface UpdateAppInput {
  image?: string;
  internalPort?: number;
  env?: Record<string, string>;
  memoryMb?: number;
  cpuCores?: number;
}

export interface ChangePasswordInput {
  currentPassword: string;
  newPassword: string;
}

export interface Me {
  id: string;
  email: string;
  role: 'owner' | 'member';
}

export interface AppEvent {
  id: string;
  action: EventAction;
  status: 'ok' | 'error';
  message: string | null;
  createdAt: string;
}

export interface App {
  id: string;
  name: string;
  image: string;
  internalPort: number;
  status: AppStatus;
  url: string;
  hostname: string;
  memoryMb: number;
  cpuCores: number;
  containerId: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AppDetail extends App {
  env: Record<string, string>;
  events: AppEvent[];
}

export interface AppStats {
  cpuPercent: number;
  memoryBytes: number;
  memoryLimitBytes: number;
  memoryPercent: number;
  netRxBytes: number;
  netTxBytes: number;
  sampledAt: string;
}

export interface HealthReport {
  ok: boolean;
  checks: { name: string; ok: boolean; detail: string }[];
  version: string;
}

export interface ServerInfo {
  domain: string;
  platform: string;
  reservedNames: string[];
  limits: {
    memory: { min: number; max: number; default: number };
    cpu: { min: number; max: number; default: number };
  };
}

/** Shape of every error the API returns. */
export interface ApiError {
  error: string;
  /** Present when a field caused the failure, so the form can point at it. */
  field?: string;
}
