import { Readable } from 'node:stream';
import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import { isValidRollCode } from '../lib/crypto.js';
import {
  DriveAuthExpiredError,
  DriveNotConnectedError,
  uploadPhoto,
} from '../lib/drive.js';
import { buildPhotoFilename, detectImageType, sanitiseNameFragment } from '../lib/image.js';
import { recallUpload, rememberUpload } from '../lib/idempotency.js';
import { publicRollView, rollStatus } from '../lib/rolls.js';
import { store } from '../lib/store.js';

/** Rejects capture times that are obviously wrong, e.g. an unset phone clock. */
function parseTakenAt(raw: string | undefined): Date {
  if (!raw) return new Date();
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return new Date();
  const skewMs = Math.abs(Date.now() - parsed.getTime());
  return skewMs > 7 * 24 * 60 * 60 * 1000 ? new Date() : parsed;
}

function firstFieldValue(fields: unknown, name: string): string | undefined {
  const record = fields as Record<string, unknown> | undefined;
  const entry = record?.[name];
  const candidate = Array.isArray(entry) ? entry[0] : entry;
  if (candidate && typeof candidate === 'object' && 'value' in candidate) {
    const value = (candidate as { value: unknown }).value;
    return typeof value === 'string' ? value : undefined;
  }
  return undefined;
}

export async function cameraRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { code: string } }>('/api/rolls/:code', async (request, reply) => {
    const { code } = request.params;
    if (!isValidRollCode(code)) {
      return reply.code(404).send({ error: 'not_found', message: 'No such camera.' });
    }
    const roll = store.findRollByCode(code);
    if (!roll) {
      return reply.code(404).send({ error: 'not_found', message: 'No such camera.' });
    }
    return reply.send(publicRollView(roll));
  });

  app.post<{ Params: { code: string } }>(
    '/api/rolls/:code/photos',
    {
      config: {
        rateLimit: {
          max: config.UPLOAD_RATE_LIMIT_PER_MINUTE,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      const { code } = request.params;
      if (!isValidRollCode(code)) {
        return reply.code(404).send({ error: 'not_found', message: 'No such camera.' });
      }
      const roll = store.findRollByCode(code);
      if (!roll) {
        return reply.code(404).send({ error: 'not_found', message: 'No such camera.' });
      }

      const status = rollStatus(roll);
      if (status !== 'open') {
        return reply.code(409).send({
          error: status,
          message:
            status === 'full'
              ? 'This camera has used up its roll.'
              : 'This camera is no longer accepting photos.',
        });
      }

      if (!store.getHost()) {
        return reply.code(503).send({
          error: 'drive_not_connected',
          message: 'The camera owner has not connected Google Drive yet.',
        });
      }

      let part;
      try {
        part = await request.file({ limits: { fileSize: config.MAX_UPLOAD_BYTES } });
      } catch (err) {
        request.log.warn({ err }, 'rejected malformed multipart upload');
        return reply
          .code(400)
          .send({ error: 'bad_request', message: 'Expected a multipart photo upload.' });
      }
      if (!part) {
        return reply
          .code(400)
          .send({ error: 'bad_request', message: 'No photo was attached.' });
      }

      const clientPhotoId = firstFieldValue(part.fields, 'clientPhotoId')?.slice(0, 64) ?? null;
      if (clientPhotoId) {
        const already = recallUpload(roll.id, clientPhotoId);
        if (already) {
          // A retry of a request that already succeeded. Drain the body so the
          // connection closes cleanly, then acknowledge without duplicating.
          part.file.resume();
          return reply.send({ ok: true, duplicate: true, fileId: already });
        }
      }

      let buffer: Buffer;
      try {
        buffer = await part.toBuffer();
      } catch (err) {
        request.log.warn({ err }, 'upload aborted or exceeded size limit');
        return reply.code(413).send({
          error: 'too_large',
          message: `Photo exceeds the ${Math.round(config.MAX_UPLOAD_BYTES / 1024 / 1024)} MB limit.`,
        });
      }
      if (part.file.truncated) {
        return reply.code(413).send({
          error: 'too_large',
          message: `Photo exceeds the ${Math.round(config.MAX_UPLOAD_BYTES / 1024 / 1024)} MB limit.`,
        });
      }
      if (buffer.length === 0) {
        return reply.code(400).send({ error: 'bad_request', message: 'Photo was empty.' });
      }

      // Never trust the declared content type on a public endpoint.
      const detected = detectImageType(buffer);
      if (!detected) {
        return reply
          .code(415)
          .send({ error: 'unsupported_type', message: 'That file is not a photo.' });
      }

      const shooterRaw = firstFieldValue(part.fields, 'shooter');
      const shooter = shooterRaw ? sanitiseNameFragment(shooterRaw, 24) || null : null;
      const takenAt = parseTakenAt(firstFieldValue(part.fields, 'takenAt'));

      // Claim a slot up front so simultaneous shutters cannot exceed the cap.
      const slot = await store.reservePhotoSlot(roll.id);
      if (!slot) {
        return reply
          .code(409)
          .send({ error: 'full', message: 'This camera has used up its roll.' });
      }

      try {
        const { fileId } = await uploadPhoto({
          folderId: roll.driveFolderId,
          filename: buildPhotoFilename({
            takenAt,
            sequence: slot.sequence,
            shooter,
            extension: detected.extension,
          }),
          mimeType: detected.mimeType,
          body: Readable.from(buffer),
          takenAt,
        });

        await store.recordPhoto({
          rollId: roll.id,
          driveFileId: fileId,
          bytes: buffer.length,
          mimeType: detected.mimeType,
          shooter,
          clientPhotoId,
        });
        if (clientPhotoId) rememberUpload(roll.id, clientPhotoId, fileId);

        request.log.info(
          { rollCode: roll.code, bytes: buffer.length, sequence: slot.sequence },
          'photo uploaded to drive',
        );
        return reply.send({
          ok: true,
          fileId,
          photoCount: slot.sequence,
          remaining: slot.remaining,
        });
      } catch (err) {
        // Hand the slot back so the guest's retry is not counted against the cap.
        await store.releasePhotoSlot(roll.id);

        if (err instanceof DriveNotConnectedError) {
          return reply.code(503).send({ error: 'drive_not_connected', message: err.message });
        }
        if (err instanceof DriveAuthExpiredError) {
          request.log.error('drive credentials rejected; host must reconnect');
          return reply.code(503).send({
            error: 'drive_auth_expired',
            message: 'The camera owner needs to reconnect Google Drive.',
          });
        }
        request.log.error({ err }, 'drive upload failed');
        // 502 tells the client queue this is worth retrying later.
        return reply.code(502).send({
          error: 'upload_failed',
          message: 'Could not reach Google Drive. The photo will be retried.',
        });
      }
    },
  );
}
