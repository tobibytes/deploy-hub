import type { FastifyPluginAsync } from 'fastify';
import { sql } from 'drizzle-orm';
import type { HealthReport } from '@rig/shared';
import type { RigServices } from '../services.js';

/**
 * Public, because Compose and the Pi's own monitoring need to reach it before
 * anyone signs in. It reports only whether the parts are reachable, never data.
 */
export const healthRoutes =
  (services: RigServices): FastifyPluginAsync =>
  async (fastify) => {
    fastify.get('/health', async (_request, reply) => {
      const checks: HealthReport['checks'] = [];

      checks.push(await check('database', async () => {
        await services.db.execute(sql`select 1`);
        return 'reachable';
      }));

      checks.push(await check('docker', async () => {
        await services.engine.ping();
        return `reachable, ${await services.engine.platform()}`;
      }));

      if (services.config.TRAEFIK_PING_URL) {
        checks.push(await check('traefik', async () => {
          const response = await fetch(services.config.TRAEFIK_PING_URL, {
            signal: AbortSignal.timeout(3000),
          });
          if (!response.ok) throw new Error(`answered ${response.status}`);
          return 'reachable';
        }));
      }

      const ok = checks.every((c) => c.ok);
      const report: HealthReport = { ok, checks, version: services.config.version };
      return reply.code(ok ? 200 : 503).send(report);
    });
  };

async function check(name: string, run: () => Promise<string>) {
  try {
    return { name, ok: true, detail: await run() };
  } catch (error) {
    return { name, ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}
