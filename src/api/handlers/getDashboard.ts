import type { FastifyRequest, FastifyReply } from 'fastify';
import * as dealService from '../../services/dealService';

export async function getDashboardHandler(
  _request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const stats = await dealService.getDashboardStats();
  reply.send({ success: true, stats });
}
