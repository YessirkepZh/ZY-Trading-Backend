import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../../config';

const REFRESH_COOKIE = 'zy_refresh';
const REFRESH_COOKIE_PATH = '/api/auth';

function cookieAttributes(maxAgeSec: number): string {
  // Frontend and API live on different sites in production, so the cookie must be cross-site
  const crossSite = config.nodeEnv === 'production';
  return [
    `Path=${REFRESH_COOKIE_PATH}`,
    'HttpOnly',
    `Max-Age=${maxAgeSec}`,
    crossSite ? 'Secure; SameSite=None' : 'SameSite=Lax',
  ].join('; ');
}

export function setRefreshCookie(reply: FastifyReply, token: string, maxAgeSec: number): void {
  reply.header('Set-Cookie', `${REFRESH_COOKIE}=${token}; ${cookieAttributes(maxAgeSec)}`);
}

export function clearRefreshCookie(reply: FastifyReply): void {
  reply.header('Set-Cookie', `${REFRESH_COOKIE}=; ${cookieAttributes(0)}`);
}

export function readRefreshCookie(request: FastifyRequest): string | null {
  const header = request.headers.cookie;
  if (!header) return null;
  for (const part of header.split(';')) {
    const [name, ...value] = part.trim().split('=');
    if (name === REFRESH_COOKIE) return value.join('=') || null;
  }
  return null;
}
