import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config.js';
import { safeEqual, signValue, verifySignedValue } from './crypto.js';

const COOKIE = 'otacam_admin';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export function issueAdminSession(reply: FastifyReply): void {
  reply.setCookie(COOKIE, signValue(`admin:${Date.now()}`), {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProduction,
    maxAge: MAX_AGE_SECONDS,
  });
}

export function clearAdminSession(reply: FastifyReply): void {
  reply.clearCookie(COOKIE, { path: '/' });
}

export function isAdmin(request: FastifyRequest): boolean {
  const raw = request.cookies[COOKIE];
  if (!raw) return false;
  const value = verifySignedValue(raw);
  if (!value?.startsWith('admin:')) return false;
  const issuedAt = Number(value.slice('admin:'.length));
  if (!Number.isFinite(issuedAt)) return false;
  return Date.now() - issuedAt < MAX_AGE_SECONDS * 1000;
}

export function checkAdminPassword(candidate: string): boolean {
  return safeEqual(candidate, config.ADMIN_PASSWORD);
}

/** Fastify preHandler that rejects anyone without a valid admin cookie. */
export async function requireAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (!isAdmin(request)) {
    await reply.code(401).send({ error: 'unauthorised', message: 'Admin sign-in required.' });
  }
}
