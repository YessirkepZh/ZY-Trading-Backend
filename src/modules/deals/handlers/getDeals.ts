import type { FastifyRequest, FastifyReply } from 'fastify';
import { GetDealsSchema } from '../schemas';
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

  const { status, strategy, limit, offset } = parsed.data;
  const deals = await dealService.getDeals({ status, strategy, limit, offset });
  reply.send({ success: true, deals, count: deals.length });
}
