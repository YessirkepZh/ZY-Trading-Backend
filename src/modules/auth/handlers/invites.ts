import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import * as authService from '../authService';
import { requireAdmin } from '../guard';
import type { AuthHooks } from '../types';
import { sendSession } from './session';

const CreateInviteSchema = z.object({
  email: z.string().email().max(255).optional(),
  role: z.enum(['admin', 'user']).default('user'),
});

const AcceptInviteSchema = z.object({
  token: z.string().min(1).max(200),
  email: z.string().email().max(255),
  password: z.string().min(authService.MIN_PASSWORD_LENGTH).max(200),
});

const ACCEPT_INVITE_ERRORS = {
  invalid_invite: { status: 400, error: 'Приглашение недействительно или истекло' },
  email_mismatch: { status: 400, error: 'Приглашение выписано на другой email' },
  email_taken: { status: 409, error: 'Пользователь с таким email уже существует' },
} as const;

export async function createInviteHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const admin = requireAdmin(request, reply);
  if (!admin) return;

  const parsed = CreateInviteSchema.safeParse(request.body ?? {});
  if (!parsed.success) {
    reply.status(400).send({ success: false, error: parsed.error.flatten() });
    return;
  }
  const { token, invite } = await authService.createInvite({
    createdBy: admin.id,
    email: parsed.data.email ?? null,
    role: parsed.data.role,
  });
  reply.status(201).send({ success: true, token, invite });
}

export async function listInvitesHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  if (!requireAdmin(request, reply)) return;
  reply.send({ success: true, invites: await authService.listInvites() });
}

export function acceptInviteHandler(hooks: AuthHooks) {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const parsed = AcceptInviteSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.status(400).send({ success: false, error: parsed.error.flatten() });
      return;
    }

    const result = await authService.acceptInvite(parsed.data, hooks);
    if (result.status !== 'ok') {
      const { status, error } = ACCEPT_INVITE_ERRORS[result.status];
      reply.status(status).send({ success: false, error });
      return;
    }
    sendSession(reply, result.session);
  };
}
