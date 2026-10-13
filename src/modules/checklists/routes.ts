import type { FastifyInstance } from 'fastify';
import { getChecklistItemsHandler, getChecklistForExtensionHandler } from './handlers/getChecklistItems';
import {
  getGroupsHandler,
  createChecklistItemHandler,
  updateChecklistItemHandler,
  deleteChecklistItemHandler,
} from './handlers/manageChecklistItems';

export function registerChecklistRoutes(fastify: FastifyInstance): void {
  // Groups — read-only (always 3 fixed groups: Пробой, Ложный Пробой, Отбой)
  fastify.get('/api/checklist-groups', getGroupsHandler);

  // Items — full CRUD for admin UI
  fastify.get('/api/checklist-items', getChecklistItemsHandler);
  fastify.post('/api/checklist-items', createChecklistItemHandler);
  fastify.put<{ Params: { id: string } }>('/api/checklist-items/:id', updateChecklistItemHandler);
  fastify.delete<{ Params: { id: string } }>('/api/checklist-items/:id', deleteChecklistItemHandler);

  // Chrome Extension — grouped checklist, optimised for display + key sending
  fastify.get('/api/checklist', getChecklistForExtensionHandler);
}
