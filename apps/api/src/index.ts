import { loadConfig } from './config.js';
import { createServices } from './services.js';
import { buildServer } from './server.js';

async function main(): Promise<void> {
  const config = loadConfig();
  const services = await createServices(config, console);
  const fastify = await buildServer(services);

  const shutdown = async (signal: string) => {
    fastify.log.info({ signal }, 'shutting down');
    await fastify.close();
    await services.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  // Listen first. Reconciling talks to Docker, and if Docker is slow or not up
  // yet that must not keep the dashboard and the health check offline.
  await fastify.listen({ port: config.PORT, host: config.HOST });
  fastify.log.info(
    { domain: config.BASE_DOMAIN, dashboard: `https://${config.rigHostname}` },
    'rig is up',
  );

  // One pass straight away so the first page load is accurate, then every 30
  // seconds. A failure here is logged and retried, never fatal.
  void services.reconciler.runOnce().catch((error: unknown) => {
    fastify.log.warn({ error: String(error) }, 'first reconcile failed, will try again');
  });
  services.reconciler.start();
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
