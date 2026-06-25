import type { FastifyRequest, FastifyReply } from 'fastify';
import * as dealService from '../../services/dealService';
import { AddDealCommentSchema } from '../../utils/validators';

export async function addDealCommentHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const id = parseInt(request.params.id, 10);
  if (isNaN(id) || id <= 0) {
    reply.status(400).send({ success: false, error: 'Invalid deal id' });
    return;
  }

  const parsed = AddDealCommentSchema.safeParse(request.body);
  if (!parsed.success) {
    reply.status(400).send({ success: false, error: parsed.error.flatten() });
    return;
  }

  const deal = await dealService.getDealById(id);
  if (!deal) {
    reply.status(404).send({ success: false, error: `Deal #${id} not found` });
    return;
  }

  const comment = await dealService.addDealComment(id, parsed.data.text);
  reply.status(201).send({ success: true, comment });
}
