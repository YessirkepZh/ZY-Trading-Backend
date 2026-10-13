import { z } from 'zod';
import type { FastifyRequest, FastifyReply } from 'fastify';
import * as svc from '../checklistItemService';

// ── Schemas ───────────────────────────────────────────────────────────────────

const CreateItemSchema = z.object({
  groupId: z.number().int().positive(),
  itemType: z.enum(['plus', 'minus', 'wait']),
  key: z.string().min(1).max(60).regex(/^[a-z0-9_]+$/, 'Key must be snake_case (lowercase, digits, underscores)'),
  label: z.string().min(1).max(200),
  position: z.number().int().min(0).default(0),
});

const UpdateItemSchema = z.object({
  label: z.string().min(1).max(200).optional(),
  position: z.number().int().min(0).optional(),
}).refine((d) => d.label !== undefined || d.position !== undefined, {
  message: 'At least one of label or position must be provided',
});

// ── Groups — read-only ────────────────────────────────────────────────────────

export async function getGroupsHandler(
  _request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  reply.send({ success: true, groups: svc.getAllGroups() });
}

// ── Items CRUD ────────────────────────────────────────────────────────────────

export async function createChecklistItemHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const parsed = CreateItemSchema.safeParse(request.body);
  if (!parsed.success) {
    reply.status(400).send({ success: false, error: parsed.error.flatten() });
    return;
  }
  try {
    const item = await svc.createItem(parsed.data);
    reply.status(201).send({ success: true, item });
  } catch (err) {
    request.log.error({ err }, 'createChecklistItem failed');
    const msg = err instanceof Error ? err.message : 'Unknown error';
    const status = msg.includes('unique') || msg.includes('duplicate') ? 409
      : msg.includes('not found') ? 404
      : 500;
    reply.status(status).send({ success: false, error: msg });
  }
}

export async function updateChecklistItemHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const id = parseInt(request.params.id, 10);
  if (isNaN(id) || id <= 0) {
    reply.status(400).send({ success: false, error: 'Invalid id' });
    return;
  }
  const parsed = UpdateItemSchema.safeParse(request.body);
  if (!parsed.success) {
    reply.status(400).send({ success: false, error: parsed.error.flatten() });
    return;
  }
  try {
    const item = await svc.updateItem(id, parsed.data);
    reply.send({ success: true, item });
  } catch (err) {
    request.log.error({ err }, 'updateChecklistItem failed');
    const msg = err instanceof Error ? err.message : 'Unknown error';
    reply.status(msg.includes('not found') ? 404 : 500).send({ success: false, error: msg });
  }
}

export async function deleteChecklistItemHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const id = parseInt(request.params.id, 10);
  if (isNaN(id) || id <= 0) {
    reply.status(400).send({ success: false, error: 'Invalid id' });
    return;
  }
  try {
    await svc.deleteItem(id);
    reply.send({ success: true });
  } catch (err) {
    request.log.error({ err }, 'deleteChecklistItem failed');
    const msg = err instanceof Error ? err.message : 'Unknown error';
    reply.status(msg.includes('not found') ? 404 : 500).send({ success: false, error: msg });
  }
}
