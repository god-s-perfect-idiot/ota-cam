import { createRequire } from 'node:module';
import type { Readable } from 'node:stream';
import type { drive_v3 } from 'googleapis';
import { config } from '../config.js';
import { decryptSecret } from './crypto.js';
import { store } from './store.js';

/**
 * Lazy-load googleapis — it is huge and must not run on every cold start
 * (e.g. /api/admin/status), or Vercel hobby functions hit 504 timeouts.
 */
const require = createRequire(import.meta.url);
function google() {
  return (require('googleapis') as typeof import('googleapis')).google;
}

/**
 * `drive.file` is the narrowest scope that permits uploads: it grants access
 * only to files this app itself created, so connecting an account never exposes
 * the rest of the host's Drive.
 */
export const DRIVE_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/userinfo.email',
];

export const ROOT_FOLDER_NAME = 'Disposable Camera';

export class DriveNotConnectedError extends Error {
  constructor() {
    super('No Google account is connected. Visit /admin and connect Drive.');
    this.name = 'DriveNotConnectedError';
  }
}

export class DriveAuthExpiredError extends Error {
  constructor() {
    super('Google access was revoked or expired. Reconnect Drive from /admin.');
    this.name = 'DriveAuthExpiredError';
  }
}

type OAuth2Client = InstanceType<typeof import('googleapis').google.auth.OAuth2>;

function newOAuthClient(): OAuth2Client {
  if (!config.googleConfigured) {
    throw new Error(
      'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set. See README.md for setup.',
    );
  }
  const Auth = google().auth as unknown as {
    OAuth2: new (clientId?: string, clientSecret?: string, redirectUri?: string) => OAuth2Client;
  };
  return new Auth.OAuth2(
    config.GOOGLE_CLIENT_ID,
    config.GOOGLE_CLIENT_SECRET,
    config.oauthRedirectUri,
  );
}

export function buildConsentUrl(state: string): string {
  return newOAuthClient().generateAuthUrl({
    access_type: 'offline',
    // Forcing the consent screen guarantees Google returns a refresh token even
    // if this account has authorised the app before.
    prompt: 'consent',
    include_granted_scopes: true,
    scope: DRIVE_SCOPES,
    state,
  });
}

export async function exchangeCodeForHost(code: string): Promise<{
  email: string;
  refreshToken: string;
}> {
  const client = newOAuthClient();
  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    throw new Error(
      'Google did not return a refresh token. Revoke this app at ' +
        'https://myaccount.google.com/permissions and try connecting again.',
    );
  }
  client.setCredentials(tokens);
  const { data } = await google().oauth2({ version: 'v2', auth: client }).userinfo.get();
  return { email: data.email ?? 'unknown', refreshToken: tokens.refresh_token };
}

export async function revokeHostAccess(refreshToken: string): Promise<void> {
  try {
    await newOAuthClient().revokeToken(refreshToken);
  } catch {
    // Already revoked upstream, or the network is down; dropping our copy is
    // what actually matters here.
  }
}

let cached: { refreshTokenEnc: string; drive: drive_v3.Drive } | null = null;

function driveClient(): drive_v3.Drive {
  const host = store.getHost();
  if (!host) throw new DriveNotConnectedError();
  if (cached?.refreshTokenEnc === host.refreshTokenEnc) return cached.drive;

  const auth = newOAuthClient();
  let refreshToken: string;
  try {
    refreshToken = decryptSecret(host.refreshTokenEnc);
  } catch {
    // Happens when ENCRYPTION_KEY changed or the store has placeholder/demo data.
    throw new DriveAuthExpiredError();
  }
  auth.setCredentials({ refresh_token: refreshToken });
  const drive = google().drive({ version: 'v3', auth });
  cached = { refreshTokenEnc: host.refreshTokenEnc, drive };
  return drive;
}

export function invalidateDriveCache(): void {
  cached = null;
}

function rethrowAuthErrors(err: unknown): never {
  const message = err instanceof Error ? err.message : String(err);
  if (/invalid_grant|invalid_token|unauthorized|Token has been expired/i.test(message)) {
    throw new DriveAuthExpiredError();
  }
  throw err;
}

async function ensureRootFolder(): Promise<string> {
  const host = store.getHost();
  if (!host) throw new DriveNotConnectedError();
  if (host.rootFolderId) return host.rootFolderId;

  const drive = driveClient();
  const { data } = await drive.files.create({
    requestBody: {
      name: ROOT_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
    },
    fields: 'id',
  });
  if (!data.id) throw new Error('Drive did not return an id for the root folder');
  await store.setHost({ ...host, rootFolderId: data.id });
  return data.id;
}

export async function createRollFolder(
  name: string,
): Promise<{ id: string; url: string }> {
  try {
    const parent = await ensureRootFolder();
    const drive = driveClient();
    const { data } = await drive.files.create({
      requestBody: {
        name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [parent],
      },
      fields: 'id, webViewLink',
    });
    if (!data.id) throw new Error('Drive did not return an id for the roll folder');
    return {
      id: data.id,
      url: data.webViewLink ?? `https://drive.google.com/drive/folders/${data.id}`,
    };
  } catch (err) {
    rethrowAuthErrors(err);
  }
}

export async function uploadPhoto(options: {
  folderId: string;
  filename: string;
  mimeType: string;
  body: Readable;
  takenAt: Date;
}): Promise<{ fileId: string }> {
  const { folderId, filename, mimeType, body, takenAt } = options;
  try {
    const { data } = await driveClient().files.create({
      requestBody: {
        name: filename,
        parents: [folderId],
        // Makes Drive sort by capture time rather than upload time, which
        // matters when queued shots arrive late.
        modifiedTime: takenAt.toISOString(),
      },
      media: { mimeType, body },
      fields: 'id',
    });
    if (!data.id) throw new Error('Drive did not return a file id');
    return { fileId: data.id };
  } catch (err) {
    rethrowAuthErrors(err);
  }
}

export async function deleteDriveFile(fileId: string): Promise<void> {
  try {
    await driveClient().files.delete({ fileId });
  } catch (err) {
    rethrowAuthErrors(err);
  }
}
