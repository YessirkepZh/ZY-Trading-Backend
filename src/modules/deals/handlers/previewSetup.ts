import type { FastifyRequest, FastifyReply } from 'fastify';
import { currentUser } from '../../auth';
import { resolveRiskForDeal } from '../../tradingSettings';
import { PreviewSetupSchema } from '../schemas';
import { prepareSetup, SetupValidationError } from '../setupService';

/** Calculates entry/SL/TP without saving: the extension draws them on the screenshot before createNote */
export async function previewSetupHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const parsed = PreviewSetupSchema.safeParse(request.body);
  if (!parsed.success) {
    reply.status(400).send({ success: false, error: parsed.error.flatten() });
    return;
  }

  try {
    const userId = currentUser(request).id;
    const input = parsed.data;
    const resolved = await resolveRiskForDeal(userId, input.strategy, input.riskPresetId);
    const { calcResult } = await prepareSetup({
      ...input,
      riskPercent: input.riskPercent ?? resolved.riskPercent,
      ratio: input.ratio ?? resolved.ratio,
      luftPercent: input.luftPercent ?? resolved.luftPercent,
      riskSum: input.riskSum ?? resolved.riskSum,
    });
    reply.send({ success: true, calcResult, riskPresetId: resolved.presetId });
  } catch (err) {
    if (err instanceof SetupValidationError) {
      reply.status(400).send({ success: false, error: err.message });
      return;
    }
    request.log.error({ err }, 'previewSetup failed');
    reply.status(500).send({
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}
