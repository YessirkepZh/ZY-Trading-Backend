import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { currentUser } from '../../auth';
import * as svc from '../tradingSettingsService';

const CreateSchema = z.object({
  name: z.string().min(1).max(80),
  riskPercent: z.number().min(0.1).max(100),
  ratio: z.number().min(0.1).max(20),
  luftPercent: z.number().min(0).max(100),
  riskSum: z.number().positive(),
  isDefault: z.boolean().optional(),
});

const UpdateSchema = CreateSchema.partial();

export async function listRiskPresetsHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const presets = await svc.listRiskPresets(currentUser(request).id);
  reply.send({ success: true, presets });
}

export async function createRiskPresetHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const parsed = CreateSchema.safeParse(request.body);
  if (!parsed.success) {
    reply.status(400).send({ success: false, error: parsed.error.flatten() });
    return;
  }
  try {
    const preset = await svc.createRiskPreset(currentUser(request).id, parsed.data);
    reply.status(201).send({ success: true, preset });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    const status = msg.includes('unique') || msg.includes('duplicate') ? 409 : 500;
    reply.status(status).send({ success: false, error: msg });
  }
}

export async function updateRiskPresetHandler(
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
    const preset = await svc.updateRiskPreset(currentUser(request).id, id, parsed.data);
    reply.send({ success: true, preset });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    reply.status(msg.includes('not found') ? 404 : 400).send({ success: false, error: msg });
  }
}

export async function archiveRiskPresetHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const id = parseInt(request.params.id, 10);
  if (!Number.isFinite(id)) {
    reply.status(400).send({ success: false, error: 'Invalid id' });
    return;
  }
  try {
    await svc.archiveRiskPreset(currentUser(request).id, id);
    reply.send({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    const status = msg.includes('System') ? 403 : msg.includes('not found') ? 404 : 400;
    reply.status(status).send({ success: false, error: msg });
  }
}
