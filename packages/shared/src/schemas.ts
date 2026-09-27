import { z } from 'zod';
import { NAME_MAX, NAME_MIN } from './names.js';
import { appStatuses, CPU_CORES, eventActions, MEMORY_MB } from './limits.js';
import type { ChangePasswordInput, CreateAppInput, LoginInput, UpdateAppInput } from './types.js';

/* ---------- primitives ---------- */

export const appNameSchema = z
  .string()
  .min(NAME_MIN)
  .max(NAME_MAX)
  .regex(/^[a-z](?:[a-z0-9-]*[a-z0-9])?$/, 'Start with a letter, then lowercase letters, numbers and hyphens.');

/** A Docker image reference, for example `nginxdemos/hello` or `ghcr.io/me/app:v2`. */
export const imageSchema = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9._\-/:@]*$/, 'That does not look like a Docker image name.');

export const portSchema = z.coerce.number().int().min(1).max(65535);

export const envKeySchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'Environment names use letters, numbers and underscores.');

export const envSchema = z.record(envKeySchema, z.string().max(4096)).default({});

export const memorySchema = z.coerce.number().int().min(MEMORY_MB.min).max(MEMORY_MB.max);
export const cpuSchema = z.coerce.number().min(CPU_CORES.min).max(CPU_CORES.max);

export const appStatusSchema = z.enum(appStatuses);

export const eventActionSchema = z.enum(eventActions);

/* ---------- requests ---------- */

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(3).max(254).includes('@', { message: 'Enter an email address.' }),
  password: z.string().min(1).max(200),
});

export const createAppSchema = z.object({
  name: appNameSchema,
  image: imageSchema,
  internalPort: portSchema.default(80),
  env: envSchema,
  memoryMb: memorySchema.default(MEMORY_MB.default),
  cpuCores: cpuSchema.default(CPU_CORES.default),
});

export const updateAppSchema = z
  .object({
    image: imageSchema.optional(),
    internalPort: portSchema.optional(),
    env: envSchema.optional(),
    memoryMb: memorySchema.optional(),
    cpuCores: cpuSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to change.' });

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(10, 'Use at least 10 characters.').max(200),
});

/* ----------------------------------------------------------------------------
   The request types live in types.ts so the browser does not need zod. These
   assignments fail to compile if a schema and its type drift apart.
---------------------------------------------------------------------------- */

const _loginMatches: LoginInput = {} as z.infer<typeof loginSchema>;
const _createMatches: CreateAppInput = {} as z.infer<typeof createAppSchema>;
const _updateMatches: UpdateAppInput = {} as z.infer<typeof updateAppSchema>;
const _passwordMatches: ChangePasswordInput = {} as z.infer<typeof changePasswordSchema>;
void _loginMatches;
void _createMatches;
void _updateMatches;
void _passwordMatches;
