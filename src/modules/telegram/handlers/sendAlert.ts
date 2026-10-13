import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import * as telegramService from '../telegramService';

const SendAlertSchema = z.object({
  text: z.string().min(1),
});

export async function sendAlertHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const parsed = SendAlertSchema.safeParse(request.body);
  if (!parsed.success) {
    reply.status(400).send({ success: false, error: parsed.error.flatten() });
    return;
  }

  try {
    await telegramService.sendAlert(parsed.data.text);
  } catch (err) {
    request.log.warn({ err }, 'Telegram sendAlert failed');
    reply.status(502).send({ success: false, error: 'Telegram unavailable' });
    return;
  }
  reply.send({ success: true });
}
