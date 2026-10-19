import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { currentUser } from '../../auth';
import * as svc from '../tradingSettingsService';

const CreateSchema = z.object({
  name: z.string().min(1).max(80),
  defaultRiskPresetId: z.number().int().positive().nullable().optional(),
  position: z.number().int().min(0).optional(),
});

const UpdateSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  defaultRiskPresetId: z.number().int().positive().nullable().optional(),
  position: z.number().int().min(0).optional(),
}).refine(
  (d) => d.name !== undefined || d.defaultRiskPresetId !== undefined || d.position !== undefined,
  { message: 'At least one field required' },
);

export async function listStrategiesHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const strategies = await svc.listStrategies(currentUser(request).id);
  reply.send({ success: true, strategies });
}

export async function createStrategyHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const parsed = CreateSchema.safeParse(request.body);
  if (!parsed.success) {
    reply.status(400).send({ success: false, error: parsed.error.flatten() });
    return;
  }
  try {
    const strategy = await svc.createStrategy(currentUser(request).id, parsed.data);
    reply.status(201).send({ success: true, strategy });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    const status = msg.includes('unique') || msg.includes('duplicate') ? 409 : 500;
    reply.status(status).send({ success: false, error: msg });
  }
}

export async function updateStrategyHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const id = parseInt(request.params.id, 10);
  if (!Number.isFinite(id)) {
    reply.status(400).send({ success: false, error: 'Invalid id' });
    return;
  }
  const parsed = UpdateSchema.safeParse(request.body);
  if (!parsed.success) {
    reply.status(400).send({ success: false, error: parsed.error.flatten() });
    return;
  }
  try {
    const strategy = await svc.updateStrategy(currentUser(request).id, id, parsed.data);
    reply.send({ success: true, strategy });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    const status = msg.includes('cannot be renamed') || msg.includes('System')
      ? 403
      : msg.includes('not found') ? 404 : 400;
    reply.status(status).send({ success: false, error: msg });
  }
}

export async function archiveStrategyHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const id = parseInt(request.params.id, 10);
  if (!Number.isFinite(id)) {
    reply.status(400).send({ success: false, error: 'Invalid id' });
    return;
  }
  try {
    await svc.archiveStrategy(currentUser(request).id, id);
    reply.send({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    const status = msg.includes('System') ? 403 : msg.includes('not found') ? 404 : 400;
    reply.status(status).send({ success: false, error: msg });
  }
}
