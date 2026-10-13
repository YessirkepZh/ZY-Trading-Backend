import type { FastifyRequest, FastifyReply } from 'fastify';
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
    const { calcResult } = await prepareSetup(parsed.data);
    reply.send({ success: true, calcResult });
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
