import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import * as authService from '../authService';
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from '../cookies';
import { currentUser } from '../guard';

const LoginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(200),
});

export function sendSession(reply: FastifyReply, session: authService.Session): void {
  setRefreshCookie(reply, session.refreshToken, session.refreshTtlSec);
  reply.send({ success: true, accessToken: session.accessToken, user: session.user });
}

export async function loginHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const parsed = LoginSchema.safeParse(request.body);
  if (!parsed.success) {
    reply.status(400).send({ success: false, error: parsed.error.flatten() });
    return;
  }

  const result = await authService.login(parsed.data.email, parsed.data.password);
  if (result.status !== 'ok') {
    const tooMany = result.status === 'too_many_attempts';
    reply.status(tooMany ? 429 : 401).send({
      success: false,
      error: tooMany ? 'Слишком много попыток, попробуйте позже' : 'Неверный email или пароль',
    });
    return;
  }
  sendSession(reply, result.session);
}

export async function refreshHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = readRefreshCookie(request);
  const session = token ? await authService.refresh(token) : null;
  if (!session) {
    clearRefreshCookie(reply);
    reply.status(401).send({ success: false, error: 'Session expired' });
    return;
  }
  sendSession(reply, session);
}

export async function logoutHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = readRefreshCookie(request);
  if (token) await authService.logout(token);
  clearRefreshCookie(reply);
  reply.send({ success: true });
}

export async function meHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  reply.send({ success: true, user: currentUser(request) });
}
