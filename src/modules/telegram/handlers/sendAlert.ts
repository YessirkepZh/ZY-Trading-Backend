import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { currentUser } from '../../auth';
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

  let sent: boolean;
  try {
    sent = await telegramService.sendAlert(currentUser(request).id, parsed.data.text);
  } catch (err) {
    request.log.warn({ err }, 'Telegram sendAlert failed');
    reply.status(502).send({ success: false, error: 'Telegram unavailable' });
    return;
  }
  if (!sent) {
    reply.status(409).send({ success: false, error: 'Telegram is not linked to this account' });
    return;
  }
  reply.send({ success: true });
}
