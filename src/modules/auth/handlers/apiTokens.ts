import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import * as authService from '../authService';
import { currentUser } from '../guard';

const CreateApiTokenSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

export async function listApiTokensHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const tokens = await authService.listApiTokens(currentUser(request).id);
  reply.send({ success: true, tokens });
}

export async function createApiTokenHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const parsed = CreateApiTokenSchema.safeParse(request.body);
  if (!parsed.success) {
    reply.status(400).send({ success: false, error: parsed.error.flatten() });
    return;
  }
  const { token, info } = await authService.createApiToken(currentUser(request).id, parsed.data.name);
  reply.status(201).send({ success: true, token, apiToken: info });
}

export async function revokeApiTokenHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const id = parseInt(request.params.id, 10);
  if (isNaN(id) || id <= 0) {
    reply.status(400).send({ success: false, error: 'Invalid id' });
    return;
  }
  const revoked = await authService.revokeApiToken(currentUser(request).id, id);
  if (!revoked) {
    reply.status(404).send({ success: false, error: `API token #${id} not found` });
    return;
  }
  reply.send({ success: true });
}
