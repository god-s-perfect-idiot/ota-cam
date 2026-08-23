import { buildApp } from '../../server/dist/app.js';

let app: Awaited<ReturnType<typeof buildApp>> | undefined;

async function getApp() {
  if (!app) {
    app = await buildApp();
    await app.ready();
  }
  return app;
}

/** Netlify function — forwards requests into the same Fastify app used by `npm start`. */
export default async (request: Request): Promise<Response> => {
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
    method: request.method,
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
      responseHeaders.append(key, value);
    }
  }

  const body = result.rawPayload.length > 0 ? result.rawPayload : null;
  return new Response(body, { status: result.statusCode, headers: responseHeaders });
};
