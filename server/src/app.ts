import fs from 'node:fs';
import path from 'node:path';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import { config, repoRoot } from './config.js';
import { store } from './lib/store.js';
import { adminRoutes } from './routes/admin.js';
import { cameraRoutes } from './routes/camera.js';
import { googleAuthRoutes } from './routes/googleAuth.js';

const webDist = path.join(repoRoot, 'web', 'dist');

export async function buildApp(): Promise<FastifyInstance> {
  await store.init();

  const app = Fastify({
    // Phones behind a proxy: trust X-Forwarded-* so rate limiting sees real IPs.
    trustProxy: true,
    bodyLimit: 1 * 1024 * 1024,
    logger: {
      level: process.env.LOG_LEVEL ?? (config.isProduction ? 'info' : 'debug'),
      transport: config.isProduction
        ? undefined
        : { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } },
    },
  });

  await app.register(cookie, { secret: config.SESSION_SECRET });
  await app.register(rateLimit, {
    global: false,
    max: 300,
    timeWindow: '1 minute',
  });
  await app.register(multipart, {
    limits: {
      fileSize: config.MAX_UPLOAD_BYTES,
      files: 1,
      fields: 8,
      fieldSize: 1024,
    },
  });

  app.addHook('onClose', async () => {
    await store.close();
  });

  app.get('/api/health', async () => ({
    ok: true,
    driveConnected: Boolean(store.getHost()),
    googleConfigured: config.googleConfigured,
  }));

  await app.register(adminRoutes);
  await app.register(googleAuthRoutes);
  await app.register(cameraRoutes);

  if (fs.existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist, wildcard: false });
    // Client-side routing: anything that is not an API call or a real asset
    // falls through to the SPA shell.
    app.setNotFoundHandler(async (request, reply) => {
      if (request.method !== 'GET' || request.url.startsWith('/api/')) {
        return reply.code(404).send({ error: 'not_found' });
      }
      return reply.type('text/html').sendFile('index.html');
    });
  } else {
    app.log.warn(
      'web/dist not found. Run `npm run build` for the bundled UI, or use `npm run dev`.',
    );
  }

  return app;
}
