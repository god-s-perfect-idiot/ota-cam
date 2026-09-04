import { buildApp } from './app.js';

type InjectMethod = 'DELETE' | 'GET' | 'HEAD' | 'PATCH' | 'POST' | 'PUT' | 'OPTIONS';

let app: Awaited<ReturnType<typeof buildApp>> | undefined;

async function getApp() {
  if (!app) {
    app = await buildApp();
    await app.ready();
  }
  return app;
}

/**
 * Web-standard handler used by Netlify and Vercel function entrypoints.
 * Forwards into the same Fastify app as `npm start`.
 */
export default async (request: globalThis.Request): Promise<globalThis.Response> => {
  try {
    const fastify = await getApp();
    const url = new URL(request.url);

    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });

    let payload: Buffer | undefined;
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      payload = Buffer.from(await request.arrayBuffer());
    }

    const result = await fastify.inject({
      method: request.method.toUpperCase() as InjectMethod,
      url: `${url.pathname}${url.search}`,
      headers,
      payload,
    });

    const responseHeaders = new Headers();
    for (const [key, value] of Object.entries(result.headers)) {
      if (value === undefined) continue;
      if (Array.isArray(value)) {
        for (const part of value) responseHeaders.append(key, part);
      } else {
        responseHeaders.append(key, String(value));
      }
    }

    const body = result.rawPayload.length > 0 ? result.rawPayload : null;
    return new Response(body, { status: result.statusCode, headers: responseHeaders });
  } catch (err) {
    console.error('api function error:', err);
    const message = err instanceof Error ? err.message : 'Internal server error';
    return Response.json({ error: 'function_error', message }, { status: 500 });
  }
};
