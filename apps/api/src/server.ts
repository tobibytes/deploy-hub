import { existsSync } from 'node:fs';
import { join } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { makeRequireSession } from './auth.js';
import type { RigServices } from './services.js';
import { accountRoutes, authRoutes } from './routes/auth.js';
import { appRoutes } from './routes/apps.js';
import { healthRoutes } from './routes/health.js';

export async function buildServer(services: RigServices): Promise<FastifyInstance> {
  const { config } = services;

  const fastify = Fastify({
    logger: { level: config.LOG_LEVEL },
    // Rig sits behind Traefik, so the client address comes from the proxy header.
    trustProxy: true,
    bodyLimit: 1024 * 1024,
  });

  await fastify.register(cookie, { secret: config.SESSION_SECRET });
  await fastify.register(rateLimit, {
    global: false,
    max: 120,
    timeWindow: '1 minute',
    keyGenerator: (request) => request.ip,
  });

  /* ------------------------------- api ------------------------------- */

  await fastify.register(
    async (api) => {
      // Public: the health check and signing in.
      await api.register(healthRoutes(services));
      await api.register(authRoutes(services));

      // Everything else requires a session. The guard is a hook on this scope,
      // so a route added here cannot forget it.
      await api.register(async (guarded) => {
        guarded.addHook('onRequest', makeRequireSession(services));
        await guarded.register(accountRoutes(services));
        await guarded.register(appRoutes(services));
      });

      api.setNotFoundHandler((_request, reply) => reply.code(404).send({ error: 'No such endpoint.' }));
    },
    { prefix: '/api' },
  );

  /* ------------------------ the dashboard itself ------------------------ */

  const webDist = config.WEB_DIST || defaultWebDist();
  if (webDist && existsSync(join(webDist, 'index.html'))) {
    // `wildcard: true` matters: with it off, the plugin lists the folder once at
    // startup, so any file added afterwards falls through to the handler below
    // and is served as HTML. That breaks the dashboard in exactly the confusing
    // way where every asset answers 200.
    await fastify.register(fastifyStatic, { root: webDist, wildcard: true, index: ['index.html'] });

    // Asset names carry a content hash, so they can be cached for a long time.
    // The page itself must not be, or a new build would never be picked up.
    fastify.addHook('onSend', async (request, reply) => {
      if (request.url.startsWith('/api/')) return;
      reply.header(
        'cache-control',
        request.url.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
      );
    });

    // The dashboard is a single page app, so unknown paths return it and let the
    // router decide.
    fastify.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api/')) return reply.code(404).send({ error: 'No such endpoint.' });
      // An asset that is not there is a stale page asking for an old build. Say
      // so plainly rather than handing back HTML, which fails much later and
      // much more confusingly.
      if (request.url.startsWith('/assets/')) return reply.code(404).send({ error: 'No such file.' });
      return reply.sendFile('index.html');
    });
    fastify.log.info({ webDist }, 'serving the dashboard');
  } else {
    fastify.log.warn({ webDist }, 'no dashboard build found, serving the api only');
    fastify.setNotFoundHandler((_request, reply) =>
      reply.code(404).send({ error: 'The dashboard has not been built. Run pnpm build.' }),
    );
  }

  return fastify;
}

function defaultWebDist(): string {
  const candidates = [
    join(process.cwd(), 'web'), // the image layout: /app/web
    join(process.cwd(), '../web/dist'), // running from apps/api in development
    join(process.cwd(), 'apps/web/dist'),
  ];
  return candidates.find((dir) => existsSync(join(dir, 'index.html'))) ?? '';
}
