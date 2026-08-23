import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { config } from '../config.js';
import { generateRollCode, randomId } from '../lib/crypto.js';
import { decryptSecret } from '../lib/crypto.js';
import {
  createRollFolder,
  DriveAuthExpiredError,
  DriveNotConnectedError,
  invalidateDriveCache,
  revokeHostAccess,
} from '../lib/drive.js';
import { adminRollView } from '../lib/rolls.js';
import {
  checkAdminPassword,
  clearAdminSession,
  isAdmin,
  issueAdminSession,
  requireAdmin,
} from '../lib/session.js';
import { store } from '../lib/store.js';

const createRollSchema = z.object({
  name: z.string().trim().min(1).max(80),
  expiresInHours: z.coerce.number().int().min(1).max(24 * 30).nullish(),
  photoCap: z.coerce.number().int().min(1).max(10_000).nullish(),
});

const updateRollSchema = z.object({
  closed: z.boolean().optional(),
  name: z.string().trim().min(1).max(80).optional(),
  photoCap: z.coerce.number().int().min(1).max(10_000).optional(),
});

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  app.post<{ Body: { password?: unknown } }>(
    '/api/admin/login',
    // Brute force protection: the whole app is guarded by this one password.
    { config: { rateLimit: { max: 8, timeWindow: '5 minutes' } } },
    async (request, reply) => {
      const password = request.body?.password;
      if (typeof password !== 'string' || !checkAdminPassword(password)) {
        await new Promise((resolve) => setTimeout(resolve, 400));
        return reply
          .code(401)
          .send({ error: 'invalid_password', message: 'That password is not right.' });
      }
      issueAdminSession(reply);
      return reply.send({ ok: true });
    },
  );

  app.post('/api/admin/logout', async (_request, reply) => {
    clearAdminSession(reply);
    return reply.send({ ok: true });
  });

  app.get('/api/admin/status', async (request, reply) => {
    if (!isAdmin(request)) {
      return reply.send({ authenticated: false, googleConfigured: config.googleConfigured });
    }
    const host = store.getHost();
    return reply.send({
      authenticated: true,
      googleConfigured: config.googleConfigured,
      publicBaseUrl: config.PUBLIC_BASE_URL,
      defaultPhotoCap: config.DEFAULT_ROLL_PHOTO_CAP,
      host: host ? { email: host.email, connectedAt: host.connectedAt } : null,
      rolls: store.listRolls().map((roll) => adminRollView(roll, config.PUBLIC_BASE_URL)),
    });
  });

  app.post('/api/admin/rolls', { preHandler: requireAdmin }, async (request, reply) => {
    const parsed = createRollSchema.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'bad_request',
        message: parsed.error.issues[0]?.message ?? 'Invalid roll details.',
      });
    }
    const { name, expiresInHours, photoCap } = parsed.data;

    try {
      const folder = await createRollFolder(name);
      const roll = await store.createRoll({
        id: randomId(),
        code: generateRollCode(),
        name,
        driveFolderId: folder.id,
        driveFolderUrl: folder.url,
        createdAt: new Date().toISOString(),
        expiresAt: expiresInHours
          ? new Date(Date.now() + expiresInHours * 3_600_000).toISOString()
          : null,
        closed: false,
        photoCap: photoCap ?? config.DEFAULT_ROLL_PHOTO_CAP,
        photoCount: 0,
      });
      return reply.code(201).send(adminRollView(roll, config.PUBLIC_BASE_URL));
    } catch (err) {
      if (err instanceof DriveNotConnectedError || err instanceof DriveAuthExpiredError) {
        return reply.code(409).send({ error: 'drive_unavailable', message: err.message });
      }
      request.log.error({ err }, 'failed to create roll folder');
      return reply
        .code(502)
        .send({ error: 'drive_error', message: 'Could not create the Drive folder.' });
    }
  });

  app.patch<{ Params: { id: string } }>(
    '/api/admin/rolls/:id',
    { preHandler: requireAdmin },
    async (request, reply) => {
      const parsed = updateRollSchema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.code(400).send({ error: 'bad_request', message: 'Invalid update.' });
      }
      const roll = await store.updateRoll(request.params.id, parsed.data);
      if (!roll) return reply.code(404).send({ error: 'not_found', message: 'No such roll.' });
      return reply.send(adminRollView(roll, config.PUBLIC_BASE_URL));
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/admin/rolls/:id',
    { preHandler: requireAdmin },
    async (request, reply) => {
      // Only forgets the roll here; the photos stay in Drive where the host can
      // see them, since silently deleting someone's memories would be rude.
      const removed = await store.deleteRoll(request.params.id);
      if (!removed) return reply.code(404).send({ error: 'not_found', message: 'No such roll.' });
      return reply.send({ ok: true });
    },
  );

  app.post('/api/admin/disconnect', { preHandler: requireAdmin }, async (request, reply) => {
    const host = store.getHost();
    if (host) {
      try {
        await revokeHostAccess(decryptSecret(host.refreshTokenEnc));
      } catch (err) {
        request.log.warn({ err }, 'could not revoke google token upstream');
      }
      await store.disconnectHost();
      invalidateDriveCache();
    }
    return reply.send({ ok: true });
  });
}
