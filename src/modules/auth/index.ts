import { timingSafeEqual } from 'crypto';
import type { FastifyInstance } from 'fastify';
import { config } from '../../config';

const PUBLIC_PATHS = new Set(['/api/health']);

function isValidApiKey(header: string | string[] | undefined): boolean {
  if (typeof header !== 'string') return false;
  const given = Buffer.from(header);
  const expected = Buffer.from(config.apiKey);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export function registerAuth(fastify: FastifyInstance): void {
  // API key auth — disabled while API_KEY is empty
  fastify.addHook('onRequest', async (request, reply) => {
    if (!config.apiKey || request.method === 'OPTIONS') return;
    if (PUBLIC_PATHS.has(request.url.split('?')[0] ?? '')) return;
    if (!isValidApiKey(request.headers['x-api-key'])) {
      return reply.status(401).send({ success: false, error: 'Unauthorized' });
    }
  });

  // Lets clients verify their API key
  fastify.get('/api/auth/check', async (_request, reply) => {
    reply.send({ success: true });
  });
}
