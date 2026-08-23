import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { config } from '../config.js';
import { safeEqual } from '../lib/crypto.js';
import { encryptSecret } from '../lib/crypto.js';
import {
  buildConsentUrl,
  exchangeCodeForHost,
  invalidateDriveCache,
} from '../lib/drive.js';
import { requireAdmin } from '../lib/session.js';
import { store } from '../lib/store.js';

const STATE_COOKIE = 'otacam_oauth_state';

export async function googleAuthRoutes(app: FastifyInstance): Promise<void> {
  app.get('/api/auth/google', { preHandler: requireAdmin }, async (_request, reply) => {
    if (!config.googleConfigured) {
      return reply.code(500).send({
        error: 'google_not_configured',
        message: 'Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env, then restart.',
      });
    }
    const state = randomBytes(24).toString('base64url');
    reply.setCookie(STATE_COOKIE, state, {
      path: '/api/auth/google',
      httpOnly: true,
      sameSite: 'lax',
      secure: config.isProduction,
      maxAge: 600,
    });
    return reply.redirect(buildConsentUrl(state));
  });

  app.get<{ Querystring: { code?: string; state?: string; error?: string } }>(
    '/api/auth/google/callback',
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { code, state, error } = request.query;
      const expected = request.cookies[STATE_COOKIE];
      reply.clearCookie(STATE_COOKIE, { path: '/api/auth/google' });

      if (error) {
        return reply.redirect(`/admin?error=${encodeURIComponent(error)}`);
      }
      if (!state || !expected || !safeEqual(state, expected)) {
        return reply.redirect('/admin?error=state_mismatch');
      }
      if (!code) {
        return reply.redirect('/admin?error=missing_code');
      }

      try {
        const { email, refreshToken } = await exchangeCodeForHost(code);
        await store.setHost({
          email,
          refreshTokenEnc: encryptSecret(refreshToken),
          connectedAt: new Date().toISOString(),
          rootFolderId: null,
        });
        invalidateDriveCache();
        request.log.info({ email }, 'google drive connected');
        return reply.redirect('/admin?connected=1');
      } catch (err) {
        request.log.error({ err }, 'google oauth exchange failed');
        return reply.redirect('/admin?error=exchange_failed');
      }
    },
  );
}
