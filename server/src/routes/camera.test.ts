import fs from 'node:fs/promises';
import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface UploadArgs {
  folderId: string;
  filename: string;
  mimeType: string;
}

const uploadPhoto = vi.fn(async (_args: UploadArgs) => ({ fileId: 'drive-file-1' }));

// Drive is mocked so the suite never needs network access or real credentials.
vi.mock('../lib/drive.js', () => ({
  uploadPhoto,
  createRollFolder: vi.fn(async () => ({ id: 'folder-1', url: 'https://drive.test/folder-1' })),
  invalidateDriveCache: vi.fn(),
  revokeHostAccess: vi.fn(),
  buildConsentUrl: vi.fn(() => 'https://accounts.google.test/consent'),
  exchangeCodeForHost: vi.fn(),
  DriveNotConnectedError: class DriveNotConnectedError extends Error {},
  DriveAuthExpiredError: class DriveAuthExpiredError extends Error {},
  DRIVE_SCOPES: [],
  ROOT_FOLDER_NAME: 'Disposable Camera',
}));

const { buildApp } = await import('../app.js');
const { store } = await import('../lib/store.js');
const { config } = await import('../config.js');

const JPEG_MAGIC = [0xff, 0xd8, 0xff, 0xe0];

function jpeg(sizeBytes = 2048): Buffer {
  const buf = Buffer.alloc(sizeBytes, 0x7f);
  Buffer.from(JPEG_MAGIC).copy(buf, 0);
  return buf;
}

/** Builds a multipart body with fields ahead of the file, as the client does. */
function multipart(
  fields: Record<string, string>,
  file: { field: string; filename: string; contentType: string; content: Buffer } | null,
) {
  const boundary = '----otacamtest0123456789';
  const parts: Buffer[] = [];

  for (const [name, value] of Object.entries(fields)) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
      ),
    );
  }
  if (file) {
    parts.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${file.field}"; ` +
          `filename="${file.filename}"\r\nContent-Type: ${file.contentType}\r\n\r\n`,
      ),
      file.content,
      Buffer.from('\r\n'),
    );
  }
  parts.push(Buffer.from(`--${boundary}--\r\n`));

  return {
    payload: Buffer.concat(parts),
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
  };
}

let app: FastifyInstance;

async function seedRoll(overrides: Partial<Parameters<typeof store.createRoll>[0]> = {}) {
  return store.createRoll({
    id: 'roll-1',
    code: 'ABCDEFGHJK',
    name: 'Test party',
    driveFolderId: 'folder-1',
    driveFolderUrl: 'https://drive.test/folder-1',
    createdAt: new Date().toISOString(),
    expiresAt: null,
    closed: false,
    photoCap: 3,
    photoCount: 0,
    ...overrides,
  });
}

beforeEach(async () => {
  app = await buildApp();
  await store._reset();
  await store.setHost({
    email: 'host@example.com',
    refreshTokenEnc: 'unused-in-these-tests',
    connectedAt: new Date().toISOString(),
    rootFolderId: 'root-1',
  });
  uploadPhoto.mockClear();
});

afterEach(async () => {
  // Closing the app flushes the photo log before the data directory is removed.
  await app.close();
  await fs.rm(config.dataDir, { recursive: true, force: true });
});

afterAll(async () => {
  await fs.rm(config.dataDir, { recursive: true, force: true });
});

describe('GET /api/rolls/:code', () => {
  it('exposes only non-sensitive roll details', async () => {
    await seedRoll();
    const response = await app.inject({ method: 'GET', url: '/api/rolls/ABCDEFGHJK' });
    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body).toMatchObject({ name: 'Test party', status: 'open', acceptingPhotos: true });
    // Guests must never learn where the photos are stored.
    expect(JSON.stringify(body)).not.toContain('folder-1');
    expect(JSON.stringify(body)).not.toContain('drive.test');
  });

  it('404s for unknown and malformed codes alike', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/rolls/ZZZZZZZZZZ' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/api/rolls/..%2Fadmin' })).statusCode).toBe(404);
  });
});

describe('POST /api/rolls/:code/photos', () => {
  it('accepts a real JPEG and forwards it to Drive', async () => {
    await seedRoll();
    const body = multipart(
      { clientPhotoId: 'shot-1', takenAt: new Date().toISOString(), shooter: 'Samar' },
      { field: 'photo', filename: 'shot.jpg', contentType: 'image/jpeg', content: jpeg() },
    );

    const response = await app.inject({
      method: 'POST',
      url: '/api/rolls/ABCDEFGHJK/photos',
      ...body,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true, fileId: 'drive-file-1', photoCount: 1 });
    expect(uploadPhoto).toHaveBeenCalledOnce();
    expect(uploadPhoto.mock.calls[0]![0]).toMatchObject({
      folderId: 'folder-1',
      mimeType: 'image/jpeg',
    });
    expect(store.findRollById('roll-1')?.photoCount).toBe(1);
  });

  it('rejects a non-image even when it claims to be a JPEG', async () => {
    await seedRoll();
    const body = multipart(
      {},
      {
        field: 'photo',
        filename: 'payload.jpg',
        contentType: 'image/jpeg',
        content: Buffer.from('<html><script>alert(1)</script></html>'),
      },
    );

    const response = await app.inject({
      method: 'POST',
      url: '/api/rolls/ABCDEFGHJK/photos',
      ...body,
    });

    expect(response.statusCode).toBe(415);
    expect(uploadPhoto).not.toHaveBeenCalled();
  });

  it('rejects an empty upload', async () => {
    await seedRoll();
    const response = await app.inject({
      method: 'POST',
      url: '/api/rolls/ABCDEFGHJK/photos',
      ...multipart({ clientPhotoId: 'x' }, null),
    });
    expect(response.statusCode).toBe(400);
    expect(uploadPhoto).not.toHaveBeenCalled();
  });

  it('treats a retry of the same shot as a duplicate', async () => {
    await seedRoll();
    const send = () =>
      app.inject({
        method: 'POST',
        url: '/api/rolls/ABCDEFGHJK/photos',
        ...multipart(
          { clientPhotoId: 'retry-me' },
          { field: 'photo', filename: 'a.jpg', contentType: 'image/jpeg', content: jpeg() },
        ),
      });

    expect((await send()).statusCode).toBe(200);
    const second = await send();

    expect(second.statusCode).toBe(200);
    expect(second.json()).toMatchObject({ duplicate: true });
    // The photo must not be stored or counted twice.
    expect(uploadPhoto).toHaveBeenCalledOnce();
    expect(store.findRollById('roll-1')?.photoCount).toBe(1);
  });

  it('stops accepting photos once the cap is reached', async () => {
    await seedRoll({ photoCap: 2 });
    const send = (id: string) =>
      app.inject({
        method: 'POST',
        url: '/api/rolls/ABCDEFGHJK/photos',
        ...multipart(
          { clientPhotoId: id },
          { field: 'photo', filename: 'a.jpg', contentType: 'image/jpeg', content: jpeg() },
        ),
      });

    expect((await send('a')).statusCode).toBe(200);
    expect((await send('b')).statusCode).toBe(200);

    const overflow = await send('c');
    expect(overflow.statusCode).toBe(409);
    expect(overflow.json().error).toBe('full');
    expect(uploadPhoto).toHaveBeenCalledTimes(2);
  });

  it('refuses a closed roll', async () => {
    await seedRoll({ closed: true });
    const response = await app.inject({
      method: 'POST',
      url: '/api/rolls/ABCDEFGHJK/photos',
      ...multipart(
        {},
        { field: 'photo', filename: 'a.jpg', contentType: 'image/jpeg', content: jpeg() },
      ),
    });
    expect(response.statusCode).toBe(409);
    expect(uploadPhoto).not.toHaveBeenCalled();
  });

  it('refuses an expired roll', async () => {
    await seedRoll({ expiresAt: new Date(Date.now() - 1000).toISOString() });
    const response = await app.inject({
      method: 'POST',
      url: '/api/rolls/ABCDEFGHJK/photos',
      ...multipart(
        {},
        { field: 'photo', filename: 'a.jpg', contentType: 'image/jpeg', content: jpeg() },
      ),
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error).toBe('expired');
  });

  it('releases the reserved slot when Drive fails, so the shot can be retried', async () => {
    await seedRoll();
    uploadPhoto.mockRejectedValueOnce(new Error('drive exploded'));

    const response = await app.inject({
      method: 'POST',
      url: '/api/rolls/ABCDEFGHJK/photos',
      ...multipart(
        { clientPhotoId: 'fails' },
        { field: 'photo', filename: 'a.jpg', contentType: 'image/jpeg', content: jpeg() },
      ),
    });

    // 502 signals the client queue that retrying is worthwhile.
    expect(response.statusCode).toBe(502);
    expect(store.findRollById('roll-1')?.photoCount).toBe(0);
  });

  it('404s for an unknown roll without touching Drive', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/rolls/ZZZZZZZZZZ/photos',
      ...multipart(
        {},
        { field: 'photo', filename: 'a.jpg', contentType: 'image/jpeg', content: jpeg() },
      ),
    });
    expect(response.statusCode).toBe(404);
    expect(uploadPhoto).not.toHaveBeenCalled();
  });
});

describe('admin surface', () => {
  it('keeps roll management behind the admin password', async () => {
    for (const [method, url] of [
      ['POST', '/api/admin/rolls'],
      ['PATCH', '/api/admin/rolls/roll-1'],
      ['DELETE', '/api/admin/rolls/roll-1'],
      ['POST', '/api/admin/disconnect'],
      ['GET', '/api/auth/google'],
    ] as const) {
      const response = await app.inject({ method, url, payload: { name: 'x' } });
      expect(response.statusCode, `${method} ${url}`).toBe(401);
    }
  });

  it('does not reveal rolls or the host email to anonymous callers', async () => {
    await seedRoll();
    const response = await app.inject({ method: 'GET', url: '/api/admin/status' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ authenticated: false });
    expect(response.body).not.toContain('host@example.com');
    expect(response.body).not.toContain('ABCDEFGHJK');
  });

  it('issues a session for the right password and rejects a wrong one', async () => {
    const bad = await app.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { password: 'wrong' },
    });
    expect(bad.statusCode).toBe(401);

    const good = await app.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { password: 'test-password-123' },
    });
    expect(good.statusCode).toBe(200);

    const cookie = good.cookies[0]!;
    expect(cookie.httpOnly).toBe(true);

    const status = await app.inject({
      method: 'GET',
      url: '/api/admin/status',
      cookies: { [cookie.name]: cookie.value },
    });
    expect(status.json()).toMatchObject({
      authenticated: true,
      host: { email: 'host@example.com' },
    });
  });

  it('rejects a forged admin cookie', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/status',
      cookies: { otacam_admin: `admin:${Date.now()}.forged-signature` },
    });
    expect(response.json()).toMatchObject({ authenticated: false });
  });
});
