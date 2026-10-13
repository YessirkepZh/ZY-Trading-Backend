import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { authenticate } from './authService';
import type { AuthUser } from './types';

const PUBLIC_PATHS = new Set([
  '/api/health',
  '/api/auth/login',
  '/api/auth/refresh',
  '/api/auth/logout',
  '/api/auth/invites/accept',
]);

export function registerAuthGuard(fastify: FastifyInstance): void {
  fastify.decorateRequest('user', null);

  fastify.addHook('onRequest', async (request, reply) => {
    if (request.method === 'OPTIONS') return;
    if (PUBLIC_PATHS.has(request.url.split('?')[0] ?? '')) return;

    const apiKey = request.headers['x-api-key'];
    const user = await authenticate({
      authorization: request.headers.authorization,
      apiKey: typeof apiKey === 'string' ? apiKey : undefined,
    });
    if (!user) {
      return reply.status(401).send({ success: false, error: 'Unauthorized' });
    }
    request.user = user;
  });
}

/** Authenticated user of a protected route — the guard guarantees it is set */
export function currentUser(request: FastifyRequest): AuthUser {
  if (!request.user) {
    throw Object.assign(new Error('Unauthorized'), { statusCode: 401 });
  }
  return request.user;
}

export function requireAdmin(request: FastifyRequest, reply: FastifyReply): AuthUser | null {
  const user = currentUser(request);
  if (user.role !== 'admin') {
    reply.status(403).send({ success: false, error: 'Forbidden' });
    return null;
  }
  return user;
}
