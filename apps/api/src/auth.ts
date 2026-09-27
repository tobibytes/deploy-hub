import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, eq, gt, lt, sql } from 'drizzle-orm';
import type { Me } from '@rig/shared';
import type { Db } from './db/index.js';
import { schema } from './db/index.js';
import { hashPassword, newSessionToken, sessionDigest, verifyPassword } from './crypto.js';
import type { Config } from './config.js';

export const SESSION_COOKIE = 'rig_session';

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by `requireSession`. Absent on public routes. */
    user?: Me;
  }
}

export interface AuthDeps {
  db: Db;
  config: Config;
}

/* ------------------------------------------------------------------ users */

export async function findUserByEmail(db: Db, email: string) {
  const rows = await db
    .select()
    .from(schema.users)
    .where(sql`lower(${schema.users.email}) = ${email.trim().toLowerCase()}`)
    .limit(1);
  return rows[0];
}

/**
 * Makes sure the owner account exists. Called on every boot so a fresh Pi comes
 * up ready to log in, and so re-running Compose never duplicates the account.
 */
export async function ensureOwner(db: Db, cfg: Config): Promise<'created' | 'exists' | 'skipped'> {
  const existing = await findUserByEmail(db, cfg.OWNER_EMAIL);
  if (existing) {
    if (existing.role !== 'owner') {
      await db.update(schema.users).set({ role: 'owner' }).where(eq(schema.users.id, existing.id));
    }
    return 'exists';
  }
  if (!cfg.OWNER_PASSWORD) return 'skipped';
  await db.insert(schema.users).values({
    email: cfg.OWNER_EMAIL.trim().toLowerCase(),
    passwordHash: await hashPassword(cfg.OWNER_PASSWORD),
    role: 'owner',
  });
  return 'created';
}

export async function setPassword(db: Db, userId: string, password: string): Promise<void> {
  await db
    .update(schema.users)
    .set({ passwordHash: await hashPassword(password) })
    .where(eq(schema.users.id, userId));
}

/* --------------------------------------------------------------- sessions */

export async function createSession(
  db: Db,
  cfg: Config,
  userId: string,
  userAgent: string | undefined,
): Promise<{ token: string; expiresAt: Date }> {
  const { token, digest } = newSessionToken();
  const expiresAt = new Date(Date.now() + cfg.SESSION_DAYS * 24 * 60 * 60 * 1000);
  await db.insert(schema.sessions).values({
    tokenDigest: digest,
    userId,
    userAgent: userAgent?.slice(0, 300) ?? null,
    expiresAt,
  });
  return { token, expiresAt };
}

export async function revokeSession(db: Db, token: string): Promise<void> {
  await db.delete(schema.sessions).where(eq(schema.sessions.tokenDigest, sessionDigest(token)));
}

export async function revokeAllSessions(db: Db, userId: string): Promise<void> {
  await db.delete(schema.sessions).where(eq(schema.sessions.userId, userId));
}

export async function pruneExpiredSessions(db: Db): Promise<void> {
  await db.delete(schema.sessions).where(lt(schema.sessions.expiresAt, new Date()));
}

async function userForToken(db: Db, token: string): Promise<Me | undefined> {
  const rows = await db
    .select({ id: schema.users.id, email: schema.users.email, role: schema.users.role })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(and(eq(schema.sessions.tokenDigest, sessionDigest(token)), gt(schema.sessions.expiresAt, new Date())))
    .limit(1);
  return rows[0];
}

export function setSessionCookie(reply: FastifyReply, cfg: Config, token: string, expiresAt: Date): void {
  reply.setCookie(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: cfg.COOKIE_SECURE,
    path: '/',
    expires: expiresAt,
  });
}

export function clearSessionCookie(reply: FastifyReply, cfg: Config): void {
  reply.clearCookie(SESSION_COOKIE, { path: '/', httpOnly: true, sameSite: 'lax', secure: cfg.COOKIE_SECURE });
}

/**
 * Guard for every route except health and login. Registered as an `onRequest`
 * hook inside the authenticated scope, so a new route is protected by default
 * rather than by remembering to add a check.
 */
export function makeRequireSession(deps: AuthDeps) {
  return async function requireSession(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const token = request.cookies[SESSION_COOKIE];
    if (!token) {
      await reply.code(401).send({ error: 'Sign in to continue.' });
      return;
    }
    const user = await userForToken(deps.db, token);
    if (!user) {
      clearSessionCookie(reply, deps.config);
      await reply.code(401).send({ error: 'Your session has ended. Sign in again.' });
      return;
    }
    request.user = user;
  };
}

export async function checkPassword(db: Db, email: string, password: string): Promise<Me | null> {
  const user = await findUserByEmail(db, email);
  if (!user) {
    // Spend the same time as a real check so a missing account is not detectable.
    await verifyPassword(password, 'scrypt$AAAAAAAAAAAAAAAAAAAAAA==$AAAA');
    return null;
  }
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return null;
  return { id: user.id, email: user.email, role: user.role };
}

export type { FastifyInstance };
