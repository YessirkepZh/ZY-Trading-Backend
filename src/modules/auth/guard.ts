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

const DEVICE_ID_PATTERN = /^[A-Za-z0-9-]{8,64}$/;

const AUTH_ERRORS = {
  unauthorized: { status: 401, error: 'Unauthorized' },
  device_required: { status: 403, error: 'Обновите расширение: оно не передаёт идентификатор устройства' },
  device_mismatch: {
    status: 403,
    error: 'Токен привязан к другому устройству. Создайте новый токен на странице «Доступ»',
  },
} as const;

export function registerAuthGuard(fastify: FastifyInstance): void {
  fastify.decorateRequest('user', null);

  fastify.addHook('onRequest', async (request, reply) => {
    if (request.method === 'OPTIONS') return;
    if (PUBLIC_PATHS.has(request.url.split('?')[0] ?? '')) return;

    const apiKey = request.headers['x-api-key'];
    const deviceId = request.headers['x-device-id'];
    const result = await authenticate({
      authorization: request.headers.authorization,
      apiKey: typeof apiKey === 'string' ? apiKey : undefined,
      deviceId: typeof deviceId === 'string' && DEVICE_ID_PATTERN.test(deviceId) ? deviceId : undefined,
    });
    if (result.status !== 'ok') {
      const { status, error } = AUTH_ERRORS[result.status];
      return reply.status(status).send({ success: false, error });
    }
    request.user = result.user;
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
