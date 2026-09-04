import type { IncomingMessage, ServerResponse } from 'node:http';
import { buildApp } from './app.js';

type App = Awaited<ReturnType<typeof buildApp>>;

let app: App | undefined;

async function getApp(): Promise<App> {
  if (!app) {
    app = await buildApp();
    await app.ready();
  }
  return app;
}

/**
 * Restore `/api/...` after Vercel rewrites everything to `/api?__path=...`.
 * Without this, Fastify only ever sees `/api` and returns 404.
 */
function restoreApiPath(req: IncomingMessage): void {
  const raw = req.url ?? '/';
  const qIndex = raw.indexOf('?');
  const search = qIndex >= 0 ? raw.slice(qIndex + 1) : '';
  if (!search) return;

  const params = new URLSearchParams(search);
  const path = params.get('__path');
  if (path === null) return;

  params.delete('__path');
  const rest = params.toString();
  const suffix = path.startsWith('/') ? path : `/api/${path}`;
  req.url = rest ? `${suffix}?${rest}` : suffix;
}

function waitForResponse(res: ServerResponse): Promise<void> {
  if (res.writableEnded || res.headersSent) {
    // Already finishing — still wait for the socket to drain when possible.
  }
  return new Promise((resolve, reject) => {
    const done = () => {
      res.off('finish', done);
      res.off('close', done);
      res.off('error', onError);
      resolve();
    };
    const onError = (err: Error) => {
      res.off('finish', done);
      res.off('close', done);
      res.off('error', onError);
      reject(err);
    };
    res.on('finish', done);
    res.on('close', done);
    res.on('error', onError);
  });
}

/**
 * Vercel Node handler — pipes the real HTTP request into Fastify and waits
 * until the response is fully sent (Drive calls can take several seconds).
 */
export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    restoreApiPath(req);
    const fastify = await getApp();
    const finished = waitForResponse(res);
    fastify.server.emit('request', req, res);
    await finished;
  } catch (err) {
    console.error('vercel handler error:', err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.end(
        JSON.stringify({
          error: 'function_error',
          message: err instanceof Error ? err.message : 'Internal server error',
        }),
      );
    }
  }
}

/** Required so photo uploads are not JSON-parsed away before Fastify sees them. */
export const config = {
  api: {
    bodyParser: false,
  },
};
