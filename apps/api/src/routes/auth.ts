import type { FastifyPluginAsync } from 'fastify';
import { changePasswordSchema, loginSchema } from '@rig/shared';
import {
  checkPassword,
  clearSessionCookie,
  createSession,
  findUserByEmail,
  revokeAllSessions,
  revokeSession,
  setPassword,
  setSessionCookie,
  SESSION_COOKIE,
} from '../auth.js';
import type { RigServices } from '../services.js';
import { withTimeout } from '../timeout.js';

export const authRoutes =
  (services: RigServices): FastifyPluginAsync =>
  async (fastify) => {
    const { db, config } = services;

    fastify.post(
      '/auth/login',
      {
        config: {
          // Five tries a minute per address, so guessing a password is not practical.
          rateLimit: { max: 5, timeWindow: '1 minute' },
        },
      },
      async (request, reply) => {
        const parsed = loginSchema.safeParse(request.body);
        if (!parsed.success) {
          return reply.code(400).send({ error: 'Enter your email and password.' });
        }
        const user = await checkPassword(db, parsed.data.email, parsed.data.password);
        if (!user) {
          request.log.warn({ email: parsed.data.email, ip: request.ip }, 'failed sign in');
          return reply.code(401).send({ error: 'Wrong email or password.' });
        }
        const { token, expiresAt } = await createSession(db, config, user.id, request.headers['user-agent']);
        setSessionCookie(reply, config, token, expiresAt);
        return reply.send(user);
      },
    );

    fastify.post('/auth/logout', async (request, reply) => {
      const token = request.cookies[SESSION_COOKIE];
      if (token) await revokeSession(db, token);
      clearSessionCookie(reply, config);
      return reply.send({ ok: true });
    });
  };

/** Routes that need a signed-in user. Registered inside the guarded scope. */
export const accountRoutes =
  (services: RigServices): FastifyPluginAsync =>
  async (fastify) => {
    const { db, config } = services;

    fastify.get('/auth/me', async (request, reply) => reply.send(request.user));

    fastify.post('/auth/password', async (request, reply) => {
      const parsed = changePasswordSchema.safeParse(request.body);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        return reply.code(400).send({ error: issue?.message ?? 'Check the form.', field: issue?.path.join('.') });
      }
      const me = request.user!;
      const current = await checkPassword(db, me.email, parsed.data.currentPassword);
      if (!current) {
        return reply.code(400).send({ error: 'That is not your current password.', field: 'currentPassword' });
      }
      await setPassword(db, me.id, parsed.data.newPassword);
      // Changing a password signs every other device out.
      await revokeAllSessions(db, me.id);
      const { token, expiresAt } = await createSession(db, config, me.id, request.headers['user-agent']);
      setSessionCookie(reply, config, token, expiresAt);
      return reply.send({ ok: true });
    });

    fastify.post('/auth/logout-everywhere', async (request, reply) => {
      const me = request.user!;
      await revokeAllSessions(db, me.id);
      clearSessionCookie(reply, config);
      return reply.send({ ok: true });
    });

    fastify.get('/server-info', async (_request, reply) => {
      const user = await findUserByEmail(db, config.OWNER_EMAIL);
      return reply.send({
        domain: config.BASE_DOMAIN,
        // The architecture is cached after the first successful lookup. If Docker
        // is down, do not make the whole page wait on it: the health check is
        // where an unreachable Docker gets reported.
        platform: await withTimeout('Docker', 2_000, services.engine.platform()).catch(() => 'unknown'),
        reservedNames: config.extraReservedNames,
        ownerEmail: user?.email ?? config.OWNER_EMAIL,
        limits: {
          memory: { min: 64, max: 1024, default: 256 },
          cpu: { min: 0.1, max: 2, default: 0.5 },
        },
      });
    });
  };
