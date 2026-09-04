/**
 * Vercel Fastify entrypoint (repo root). Same app as `npm start`, including
 * static UI from web/dist and /api/* routes.
 */
import { buildApp } from './server/dist/app.js';
import { config } from './server/dist/config.js';

const app = await buildApp();

const port = Number(process.env.PORT) || 3000;
await app.listen({ port, host: '0.0.0.0' });

app.log.info(`ota-cam ready at ${config.PUBLIC_BASE_URL}`);
if (!config.googleConfigured) {
  app.log.warn('Google credentials missing: set GOOGLE_CLIENT_ID/SECRET to enable uploads.');
}
