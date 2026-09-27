import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { createAppSchema, updateAppSchema } from '@rig/shared';
import { InputError, NotFoundError } from '../apps-service.js';
import type { RigServices } from '../services.js';

interface IdParams {
  id: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const appRoutes =
  (services: RigServices): FastifyPluginAsync =>
  async (fastify) => {
    const { apps } = services;

    /**
     * Ownership is checked here rather than in each handler, so a new
     * `/apps/:id/...` route cannot be added without the check.
     */
    async function loadOwnedApp(request: FastifyRequest, reply: FastifyReply): Promise<void> {
      const { id } = request.params as IdParams;
      if (!UUID.test(id)) {
        await reply.code(404).send({ error: 'That app does not exist.' });
        return;
      }
      const me = request.user!;
      const row = await apps.row(id).catch(() => null);
      if (!row) {
        await reply.code(404).send({ error: 'That app does not exist.' });
        return;
      }
      if (row.ownerId !== me.id && me.role !== 'owner') {
        // Say "not found" rather than "not yours", so the list of apps stays private.
        await reply.code(404).send({ error: 'That app does not exist.' });
        return;
      }
    }

    fastify.get('/apps', async (request, reply) => {
      const me = request.user!;
      return reply.send(await apps.list(me.id, me.role === 'owner'));
    });

    fastify.post('/apps', async (request, reply) => {
      const parsed = createAppSchema.safeParse(request.body);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        return reply.code(400).send({ error: issue?.message ?? 'Check the form.', field: issue?.path.join('.') });
      }
      const me = request.user!;
      const app = await apps.create(me.id, parsed.data, me.role === 'owner');
      return reply.code(201).send(app);
    });

    fastify.get('/activity', async (_request, reply) => reply.send(await apps.recentActivity()));

    /**
     * Containers wearing Rig's label that no app owns. Rig leaves them running
     * and lists them here, because one of them may be something started by hand.
     */
    fastify.get('/unknown-containers', async (_request, reply) =>
      reply.send(services.reconciler.unknown()),
    );

    /* ----------------------------- one app ----------------------------- */

    fastify.register(async (scope) => {
      scope.addHook('preHandler', loadOwnedApp);

      scope.get('/apps/:id', async (request, reply) => {
        const { id } = request.params as IdParams;
        return reply.send(await apps.detail(id));
      });

      scope.patch('/apps/:id', async (request, reply) => {
        const { id } = request.params as IdParams;
        const parsed = updateAppSchema.safeParse(request.body);
        if (!parsed.success) {
          const issue = parsed.error.issues[0];
          return reply.code(400).send({ error: issue?.message ?? 'Check the form.', field: issue?.path.join('.') });
        }
        return reply.send(
          await apps.update(id, request.user!.id, parsed.data, request.user!.role === 'owner'),
        );
      });

      /**
       * Deleting always removes the container. Stored data is kept unless
       * ?deleteData=true is passed, because that part cannot be undone.
       */
      scope.delete('/apps/:id', async (request, reply) => {
        const { id } = request.params as IdParams;
        const { deleteData } = request.query as { deleteData?: string };
        await apps.remove(id, request.user!.id, deleteData === 'true');
        return reply.code(204).send();
      });

      scope.post('/apps/:id/start', async (request, reply) => {
        const { id } = request.params as IdParams;
        return reply.send(await apps.start(id, request.user!.id));
      });

      scope.post('/apps/:id/stop', async (request, reply) => {
        const { id } = request.params as IdParams;
        return reply.send(await apps.stop(id, request.user!.id));
      });

      scope.post('/apps/:id/restart', async (request, reply) => {
        const { id } = request.params as IdParams;
        return reply.send(await apps.restart(id, request.user!.id));
      });

      scope.post('/apps/:id/redeploy', async (request, reply) => {
        const { id } = request.params as IdParams;
        return reply.send(await apps.redeploy(id, request.user!.id));
      });

      scope.get('/apps/:id/progress', async (request, reply) => {
        const { id } = request.params as IdParams;
        return reply.send(apps.progress(id) ?? { appId: id, steps: [], finishedAt: null, error: null });
      });

      /** Per-app traffic, read from Traefik rather than from the app. */
      scope.get('/apps/:id/traffic', async (request, reply) => {
        const { id } = request.params as IdParams;
        const row = await apps.row(id);
        if (!services.traffic.enabled) {
          return reply.send({
            enabled: false,
            reason: 'Traefik metrics are not configured, so there are no traffic figures yet.',
          });
        }
        return reply.send({ enabled: true, ...services.traffic.forApp(row.name) });
      });

      scope.get('/apps/:id/stats', async (request, reply) => {
        const { id } = request.params as IdParams;
        const row = await apps.row(id);
        try {
          return reply.send(await services.engine.stats(row.name));
        } catch (error) {
          return reply.code(409).send({ error: messageOf(error) });
        }
      });

      /** Live logs over Server Sent Events, with the recent lines first. */
      scope.get('/apps/:id/logs', async (request, reply) => {
        const { id } = request.params as IdParams;
        const row = await apps.row(id);

        let stream: NodeJS.ReadableStream;
        try {
          stream = await services.engine.logStream(row.name, 200);
        } catch (error) {
          return reply.code(409).send({ error: messageOf(error) });
        }

        reply.raw.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        });
        reply.raw.write(`event: open\ndata: ${JSON.stringify({ app: row.name })}\n\n`);

        let buffer = '';
        const send = (line: string) => {
          reply.raw.write(`data: ${JSON.stringify(line)}\n\n`);
        };
        const onData = (chunk: Buffer | string) => {
          buffer += chunk.toString('utf8');
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) send(stripControl(line));
        };

        // A comment every 25 seconds keeps proxies from closing an idle stream.
        const heartbeat = setInterval(() => reply.raw.write(': keep-alive\n\n'), 25_000);

        const close = () => {
          clearInterval(heartbeat);
          stream.removeListener('data', onData);
          (stream as unknown as { closeUpstream?: () => void }).closeUpstream?.();
          (stream as unknown as { destroy?: () => void }).destroy?.();
          reply.raw.end();
        };

        stream.on('data', onData);
        stream.on('end', () => {
          if (buffer) send(stripControl(buffer));
          reply.raw.write('event: end\ndata: {}\n\n');
          close();
        });
        stream.on('error', (error: Error) => {
          reply.raw.write(`event: error\ndata: ${JSON.stringify({ error: error.message })}\n\n`);
          close();
        });
        request.raw.on('close', close);

        return reply;
      });
    });

    /* --------------------------- error mapping --------------------------- */

    fastify.setErrorHandler((error, request, reply) => {
      if (error instanceof InputError) {
        return reply.code(400).send({ error: error.message, field: error.field });
      }
      if (error instanceof NotFoundError) {
        return reply.code(404).send({ error: error.message });
      }
      if ((error as { statusCode?: number }).statusCode === 429) {
        return reply.code(429).send({ error: 'Too many tries. Wait a minute and try again.' });
      }
      request.log.error({ err: error, url: request.url }, 'request failed');
      return reply.code(500).send({ error: messageOf(error) });
    });
  };

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'Something went wrong on the server.';
}

/** Docker log lines can carry ANSI colour codes that would clutter the log view. */
function stripControl(line: string): string {
  // eslint-disable-next-line no-control-regex
  return line.replace(/\[[0-9;]*[A-Za-z]/g, '').replace(/\r/g, '');
}
