import type { FastifyRequest, FastifyReply } from 'fastify';
import { UpdateDealSchema } from '../../utils/validators';
import * as dealService from '../../services/dealService';
import * as claudeService from '../../services/claudeService';

export async function updateDealHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const parsed = UpdateDealSchema.safeParse(request.body);
  if (!parsed.success) {
    reply.status(400).send({ success: false, error: parsed.error.flatten() });
    return;
  }

  const { id, status, closePrice, dealResult } = parsed.data;

  const deal = await dealService.getDealById(id);
  if (!deal) {
    reply.status(404).send({ success: false, error: `Deal #${id} not found` });
    return;
  }

  if (status === 'closed') {
    if (closePrice === undefined || dealResult === undefined) {
      reply.status(400).send({
        success: false,
        error: 'closePrice and dealResult are required when status is closed',
      });
      return;
    }
    await dealService.closeDeal(id, closePrice, dealResult);

    // Reload deal for Claude analysis
    const closedDeal = await dealService.getDealById(id);
    if (closedDeal) {
      try {
        const statsResult = await claudeService.analyzeClosedDeal(closedDeal);
        await dealService.setClaudeStats(id, statsResult);
      } catch (err) {
        // Non-fatal: log and continue
        console.error('Claude analysis failed for deal', id, err);
      }
    }
  } else {
    await dealService.updateDealStatus(id, status, {
      hasDeal: status === 'entered',
    });
  }

  reply.send({ success: true, id, status });
}
