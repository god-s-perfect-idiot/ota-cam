import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, '../..');

dotenv.config({ path: path.join(repoRoot, '.env') });

const hex32 = z
  .string()
  .regex(/^[0-9a-fA-F]{64}$/, 'must be 64 hex characters (openssl rand -hex 32)');

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(8787),
  HOST: z.string().default('0.0.0.0'),
  PUBLIC_BASE_URL: z.string().url().default('http://localhost:8787'),

  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),

  ADMIN_PASSWORD: z.string().min(8, 'ADMIN_PASSWORD must be at least 8 characters'),
  ENCRYPTION_KEY: hex32,
  SESSION_SECRET: z.string().min(16),

  MAX_UPLOAD_BYTES: z.coerce.number().int().positive().default(15 * 1024 * 1024),
  DEFAULT_ROLL_PHOTO_CAP: z.coerce.number().int().positive().default(500),
  UPLOAD_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(30),

  DATA_DIR: z.string().default('./data'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

/**
 * A key present but blank in .env (`GOOGLE_CLIENT_ID=`) arrives as an empty
 * string, which would fail validation instead of falling back to the default or
 * staying optional. Treat blank as absent so a freshly copied .env.example boots.
 */
function withoutBlanks(env: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).filter(
      (entry): entry is [string, string] =>
        typeof entry[1] === 'string' && entry[1].trim() !== '',
    ),
  );
}

function load() {
  // Tests need a working config without anyone having run the setup steps.
  if (process.env.NODE_ENV === 'test') {
    process.env.ADMIN_PASSWORD ||= 'test-password';
    process.env.ENCRYPTION_KEY ||= randomBytes(32).toString('hex');
    process.env.SESSION_SECRET ||= randomBytes(32).toString('hex');
  }

  const parsed = schema.safeParse(withoutBlanks(process.env));
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(
      `Invalid configuration in .env:\n${issues}\n\n` +
        'Copy .env.example to .env and fill in the missing values. See README.md.',
    );
  }

  const env = parsed.data;
  const baseUrl = resolvePublicBaseUrl(env.PUBLIC_BASE_URL);

  return {
    ...env,
    PUBLIC_BASE_URL: baseUrl,
    dataDir: resolveDataDir(env.DATA_DIR),
    oauthRedirectUri: `${baseUrl}/api/auth/google/callback`,
    isProduction: env.NODE_ENV === 'production',
    /** Google credentials are optional at boot so the app can explain itself in the UI. */
    googleConfigured: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
  };
}

/** True on Netlify Functions, Vercel Functions, or generic Lambda. */
function isServerlessRuntime(): boolean {
  return Boolean(
    process.env.VERCEL ||
      process.env.NETLIFY ||
      process.env.AWS_LAMBDA_FUNCTION_NAME,
  );
}

/** Local dev writes under the repo; serverless runtimes only allow /tmp. */
function resolveDataDir(dataDir: string): string {
  if (path.isAbsolute(dataDir)) return dataDir;
  if (isServerlessRuntime()) {
    return '/tmp/ota-cam-data';
  }
  return path.resolve(repoRoot, dataDir);
}

/**
 * Google OAuth redirect_uri is derived from this value. Prefer an explicit
 * non-localhost PUBLIC_BASE_URL (custom domain). Otherwise use the platform
 * URL so a copied localhost .env doesn't break OAuth on Netlify/Vercel.
 */
function resolvePublicBaseUrl(configured: string): string {
  const cleaned = configured.replace(/\/+$/, '');
  if (!isServerlessRuntime()) return cleaned;

  if (cleaned && !/localhost|127\.0\.0\.1/.test(cleaned)) {
    return cleaned;
  }

  const netlifyUrl = process.env.URL?.replace(/\/+$/, '');
  if (netlifyUrl) return netlifyUrl;

  const vercelHost = process.env.VERCEL_URL?.replace(/^https?:\/\//, '').replace(/\/+$/, '');
  if (vercelHost) return `https://${vercelHost}`;

  return cleaned;
}

export type Config = ReturnType<typeof load>;

/**
 * Lazy so a bad/missing env on Vercel/Netlify doesn't crash the function
 * module at import time (FUNCTION_INVOCATION_FAILED). Errors surface as
 * JSON 500s from the serverless handler instead.
 */
let cached: Config | undefined;

function getConfig(): Config {
  if (!cached) cached = load();
  return cached;
}

export const config: Config = new Proxy({} as Config, {
  get(_target, prop) {
    return getConfig()[prop as keyof Config];
  },
});
