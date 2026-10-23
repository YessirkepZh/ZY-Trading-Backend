import { z } from 'zod';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { guardUserText } from '../../ai';
import { currentUser } from '../../auth';
import * as svc from '../checklistItemService';

function guardPromptField(
  value: string | null | undefined,
  field: string,
  maxLength: number,
): { ok: true; value: string | null | undefined } | { ok: false; error: string } {
  if (value === undefined) return { ok: true, value };
  if (value === null || value === '') return { ok: true, value: value === null ? null : '' };
  const guarded = guardUserText(value, { maxLength, field });
  if (!guarded.ok) return { ok: false, error: guarded.error };
  return { ok: true, value: guarded.text };
}

// ── Schemas ───────────────────────────────────────────────────────────────────

const CreateItemSchema = z.object({
  groupId: z.number().int().positive(),
  itemType: z.enum(['plus', 'minus', 'wait']),
  key: z.string().min(1).max(60).regex(/^[a-z0-9_]+$/, 'Key must be snake_case (lowercase, digits, underscores)'),
  label: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
  position: z.number().int().min(0).default(0),
});

const UpdateItemSchema = z.object({
  label: z.string().min(1).max(200).optional(),
  // Empty string clears the description
  description: z.string().max(500).nullable().optional(),
  position: z.number().int().min(0).optional(),
}).refine(
  (d) => d.label !== undefined || d.description !== undefined || d.position !== undefined,
  { message: 'At least one of label, description or position must be provided' },
);

// ── Groups — read-only ────────────────────────────────────────────────────────

export async function getGroupsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  await svc.reloadChecklistCache();
  reply.send({ success: true, groups: svc.getGroupsForUser(currentUser(request).id) });
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

  const labelG = guardPromptField(parsed.data.label, 'label', 200);
  if (!labelG.ok) {
    reply.status(400).send({ success: false, error: labelG.error });
    return;
  }
  const descG = guardPromptField(parsed.data.description, 'description', 500);
  if (!descG.ok) {
    reply.status(400).send({ success: false, error: descG.error });
    return;
  }

  try {
    const item = await svc.createItem(currentUser(request).id, {
      ...parsed.data,
      label: labelG.value as string,
      description: descG.value === undefined ? undefined : (descG.value || undefined),
    });
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

  const labelG = guardPromptField(parsed.data.label, 'label', 200);
  if (!labelG.ok) {
    reply.status(400).send({ success: false, error: labelG.error });
    return;
  }
  const descG = guardPromptField(parsed.data.description, 'description', 500);
  if (!descG.ok) {
    reply.status(400).send({ success: false, error: descG.error });
    return;
  }

  try {
    const item = await svc.updateItem(currentUser(request).id, id, {
      ...parsed.data,
      ...(labelG.value !== undefined ? { label: labelG.value as string } : {}),
      ...(parsed.data.description !== undefined
        ? { description: descG.value === '' || descG.value === null ? null : (descG.value as string) }
        : {}),
    });
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
    await svc.deleteItem(currentUser(request).id, id);
    reply.send({ success: true });
  } catch (err) {
    request.log.error({ err }, 'deleteChecklistItem failed');
    const msg = err instanceof Error ? err.message : 'Unknown error';
    reply.status(msg.includes('not found') ? 404 : 500).send({ success: false, error: msg });
  }
}
