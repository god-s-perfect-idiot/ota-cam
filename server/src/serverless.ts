type InjectMethod = 'DELETE' | 'GET' | 'HEAD' | 'PATCH' | 'POST' | 'PUT' | 'OPTIONS';

type App = Awaited<ReturnType<typeof import('./app.js').buildApp>>;

let app: App | undefined;

/** Prefer the real browser path if a platform rewrite collapsed it to `/api`. */
function injectUrl(request: Request): string {
  const url = new URL(request.url);
  const headerPath =
    request.headers.get('x-forwarded-uri') ||
    request.headers.get('x-invoke-path') ||
    request.headers.get('x-vercel-forwarded-path');

  if (headerPath && headerPath.startsWith('/')) {
    const base = headerPath.split('?')[0] ?? headerPath;
    const search = headerPath.includes('?')
      ? headerPath.slice(headerPath.indexOf('?'))
      : url.search;
    return `${base}${search}`;
  }

  return `${url.pathname}${url.search}`;
}

/**
 * Web-standard handler used by Netlify and Vercel function entrypoints.
 * Forwards into the same Fastify app as `npm start`.
 */
export default async (request: globalThis.Request): Promise<globalThis.Response> => {
  try {
    const { buildApp } = await import('./app.js');

    if (!app) {
      app = await buildApp();
      await app.ready();
    }

    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });

    let payload: Buffer | undefined;
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      payload = Buffer.from(await request.arrayBuffer());
    }

    const result = await app.inject({
      method: request.method.toUpperCase() as InjectMethod,
      url: injectUrl(request),
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
