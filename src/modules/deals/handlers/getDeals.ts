import type { FastifyRequest, FastifyReply } from 'fastify';
import { GetDealsSchema } from '../schemas';
import { currentUser } from '../../auth';
import * as dealService from '../dealService';

export async function getDealsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const parsed = GetDealsSchema.safeParse(request.query);
  if (!parsed.success) {
    reply.status(400).send({ success: false, error: parsed.error.flatten() });
    return;
  }

  const { status, strategy, open, limit, offset } = parsed.data;
  const deals = await dealService.getDeals(currentUser(request).id, { status, strategy, open, limit, offset });
  reply.send({ success: true, deals, count: deals.length });
}
