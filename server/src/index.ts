import { buildApp } from './app.js';
import { config } from './config.js';

async function main() {
  const app = await buildApp();

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      app.log.info(`${signal} received, shutting down`);
      void app.close().then(() => process.exit(0));
    });
  }

  await app.listen({ port: config.PORT, host: config.HOST });
  app.log.info(`ota-cam ready at ${config.PUBLIC_BASE_URL}`);
  if (!config.googleConfigured) {
    app.log.warn('Google credentials missing: set GOOGLE_CLIENT_ID/SECRET to enable uploads.');
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
