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
  const baseUrl = env.PUBLIC_BASE_URL.replace(/\/+$/, '');

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

/** Local dev writes under the repo; Netlify Functions only allow /tmp. */
function resolveDataDir(dataDir: string): string {
  if (path.isAbsolute(dataDir)) return dataDir;
  if (process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    return '/tmp/ota-cam-data';
  }
  return path.resolve(repoRoot, dataDir);
}

export const config = load();
export type Config = typeof config;
