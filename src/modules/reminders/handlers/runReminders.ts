import { timingSafeEqual } from 'crypto';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../../../config';
import { runReminders } from '../reminderService';

function cronAuthorized(request: FastifyRequest): boolean {
  const secret = config.cronSecret;
  if (!secret) return false;

  const header = request.headers.authorization;
  if (typeof header !== 'string' || !header.startsWith('Bearer ')) return false;
  const token = header.slice('Bearer '.length).trim();
  if (!token) return false;

  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function runRemindersHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  if (!config.cronSecret) {
    reply.status(503).send({ success: false, error: 'CRON_SECRET is not configured' });
    return;
  }
  if (!cronAuthorized(request)) {
    reply.status(401).send({ success: false, error: 'Unauthorized' });
    return;
  }

  const result = await runReminders();
  request.log.info({ result }, 'reminders run finished');
  reply.send({ success: true, ...result });
}
