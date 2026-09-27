import { z } from 'zod';
import { checkMountPath, NAME_MAX, NAME_MIN } from './names.js';
import { appStatuses, CPU_CORES, eventActions, MEMORY_MB } from './limits.js';
import type { ChangePasswordInput, CreateAppInput, LoginInput, SignupInput, UpdateAppInput } from './types.js';

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

export const portSchema = z.coerce
  .number({ error: 'The port must be a number.' })
  .int('The port must be a whole number.')
  .min(1, 'The port must be between 1 and 65535.')
  .max(65535, 'The port must be between 1 and 65535.');

export const envKeySchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'Environment names use letters, numbers and underscores.');

export const envSchema = z.record(envKeySchema, z.string().max(4096)).default({});

export const memorySchema = z.coerce
  .number({ error: 'Memory must be a number of megabytes.' })
  .int('Memory must be a whole number of megabytes.')
  .min(MEMORY_MB.min, `Give the app at least ${MEMORY_MB.min} MB.`)
  .max(MEMORY_MB.max, `The most an app can have is ${MEMORY_MB.max} MB.`);

export const cpuSchema = z.coerce
  .number({ error: 'CPU must be a number of cores.' })
  .min(CPU_CORES.min, `Give the app at least ${CPU_CORES.min} of a core.`)
  .max(CPU_CORES.max, `The most an app can have is ${CPU_CORES.max} cores.`);

export const appStatusSchema = z.enum(appStatuses);

export const eventActionSchema = z.enum(eventActions);

/* ---------- requests ---------- */

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().min(3).max(254).includes('@', { message: 'Enter an email address.' }),
  password: z.string().min(1).max(200),
});

/** An absolute path inside the container, or null for no stored data. */
export const volumePathSchema = z
  .string()
  .trim()
  .nullable()
  .refine((v) => v === null || v === '' || checkMountPath(v).ok, {
    error: (issue) => {
      const value = issue.input as string;
      const verdict = checkMountPath(value);
      return verdict.ok ? 'That path cannot be used.' : verdict.reason;
    },
  })
  .transform((v) => (v === null || v === '' ? null : v.replace(/\/+$/, '') || '/'));

export const createAppSchema = z.object({
  name: appNameSchema,
  image: imageSchema,
  internalPort: portSchema.default(80),
  env: envSchema,
  memoryMb: memorySchema.default(MEMORY_MB.default),
  cpuCores: cpuSchema.default(CPU_CORES.default),
  volumePath: volumePathSchema.default(null),
});

export const updateAppSchema = z
  .object({
    image: imageSchema.optional(),
    internalPort: portSchema.optional(),
    env: envSchema.optional(),
    memoryMb: memorySchema.optional(),
    cpuCores: cpuSchema.optional(),
    volumePath: volumePathSchema.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to change.' });

export const signupSchema = z.object({
  email: z.string().trim().toLowerCase().min(3).max(254).includes('@', { message: 'Enter an email address.' }),
  // Ten characters is the same floor as changing a password. Anything this
  // account can do costs the person running the server real resources.
  password: z.string().min(10, 'Use at least 10 characters.').max(200),
});

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
const _signupMatches: SignupInput = {} as z.infer<typeof signupSchema>;
void _loginMatches;
void _createMatches;
void _updateMatches;
void _passwordMatches;
void _signupMatches;
