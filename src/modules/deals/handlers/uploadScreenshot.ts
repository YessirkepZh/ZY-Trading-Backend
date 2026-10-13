import type { FastifyRequest, FastifyReply } from 'fastify';
import { storageService } from '../../storage';
import { UploadScreenshotSchema } from '../schemas';
import { currentUser } from '../../auth';
import * as dealService from '../dealService';

export async function uploadScreenshotHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const parsed = UploadScreenshotSchema.safeParse(request.body);
  if (!parsed.success) {
    reply.status(400).send({ success: false, error: parsed.error.flatten() });
    return;
  }

  const { dealId, type, screenshot } = parsed.data;

  const deal = await dealService.getDealById(currentUser(request).id, dealId);
  if (!deal) {
    reply.status(404).send({ success: false, error: `Deal #${dealId} not found` });
    return;
  }

  const url = await storageService.uploadScreenshot(screenshot, dealId, type);
  await dealService.setScreenshot(dealId, type, url);

  reply.send({ success: true, url });
}
