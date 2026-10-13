import type { FastifyInstance } from 'fastify';
import type { DealNotifier } from './types';
import { createNoteHandler } from './handlers/createNote';
import { updateDealHandler } from './handlers/updateDeal';
import { getDealsHandler } from './handlers/getDeals';
import { getDealByIdHandler } from './handlers/getDealById';
import { addDealCommentHandler } from './handlers/addDealComment';
import { uploadScreenshotHandler } from './handlers/uploadScreenshot';
import { previewSetupHandler } from './handlers/previewSetup';

export interface DealRouteDeps {
  notifier: DealNotifier;
}

export function registerDealRoutes(fastify: FastifyInstance, deps: DealRouteDeps): void {
  fastify.post('/api/previewSetup', previewSetupHandler);
  fastify.post('/api/createNote', createNoteHandler(deps.notifier));
  fastify.post('/api/updateDeal', updateDealHandler);
  fastify.get('/api/deals', getDealsHandler);
  fastify.get<{ Params: { id: string } }>('/api/deals/:id', getDealByIdHandler);
  fastify.post<{ Params: { id: string } }>('/api/deals/:id/comments', addDealCommentHandler);
  fastify.post('/api/uploadScreenshot', uploadScreenshotHandler);
}
