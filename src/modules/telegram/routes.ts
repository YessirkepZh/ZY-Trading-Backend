import type { FastifyInstance } from 'fastify';
import { sendAlertHandler } from './handlers/sendAlert';

export function registerTelegramRoutes(fastify: FastifyInstance): void {
  fastify.post('/api/sendAlert', sendAlertHandler);
}
