import type { FastifyRequest, FastifyReply } from 'fastify';
import { currentUser } from '../../auth';
import { getUserUsageSummary } from '../aiUsageService';

export async function getAiUsageHandler(
  request: FastifyRequest<{ Querystring: { days?: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const daysRaw = Number(request.query.days ?? 30);
  const days = Number.isFinite(daysRaw) ? Math.min(90, Math.max(1, Math.floor(daysRaw))) : 30;
  const usage = await getUserUsageSummary(currentUser(request).id, days);
  reply.send({ success: true, usage });
}
