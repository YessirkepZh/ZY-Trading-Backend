import type { FastifyInstance } from 'fastify';
import { getAiUsageHandler } from './handlers/getAiUsage';

export function registerAiRoutes(fastify: FastifyInstance): void {
  fastify.get('/api/ai/usage', getAiUsageHandler);
}
