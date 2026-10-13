import type { FastifyRequest, FastifyReply } from 'fastify';
import { currentUser } from '../../auth';
import * as dealService from '../dealService';

export async function getDealByIdHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const id = parseInt(request.params.id, 10);
  if (isNaN(id) || id <= 0) {
    reply.status(400).send({ success: false, error: 'Invalid deal id' });
    return;
  }

  const deal = await dealService.getDealById(currentUser(request).id, id);
  if (!deal) {
    reply.status(404).send({ success: false, error: `Deal #${id} not found` });
    return;
  }

  const comments = await dealService.getDealComments(id);

  reply.send({ success: true, deal, comments });
}
