import { timingSafeEqual } from 'crypto';
import type { FastifyInstance, FastifyRequest, FastifyReply, FastifyError } from 'fastify';
import { config } from '../config';
import { createNoteHandler } from './handlers/createNote';
import { updateDealHandler } from './handlers/updateDeal';
import { getDealsHandler } from './handlers/getDeals';
import { getDealByIdHandler } from './handlers/getDealById';
import { addDealCommentHandler } from './handlers/addDealComment';
import { getDashboardHandler } from './handlers/getDashboard';
import { sendAlertHandler } from './handlers/sendAlert';
import { uploadScreenshotHandler } from './handlers/uploadScreenshot';
import { createAnalysisHandler } from './handlers/createAnalysis';
import {
  getAnalysisReportsHandler,
  getAnalysisReportByIdHandler,
  getLatestAnalysisHandler,
} from './handlers/getAnalysisReports';
import { getChecklistItemsHandler, getChecklistForExtensionHandler } from './handlers/getChecklistItems';
import {
  getGroupsHandler,
  createChecklistItemHandler,
  updateChecklistItemHandler,
  deleteChecklistItemHandler,
} from './handlers/manageChecklistItems';
import { getStockPriceHandler, getCryptoPriceHandler, getForexPriceHandler } from './handlers/getMarketPrice';

const PUBLIC_PATHS = new Set(['/api/health']);

function isValidApiKey(header: string | string[] | undefined): boolean {
  if (typeof header !== 'string') return false;
  const given = Buffer.from(header);
  const expected = Buffer.from(config.apiKey);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export async function registerRoutes(fastify: FastifyInstance): Promise<void> {
  // API key auth — disabled while API_KEY is empty
  fastify.addHook('onRequest', async (request, reply) => {
    if (!config.apiKey || request.method === 'OPTIONS') return;
    if (PUBLIC_PATHS.has(request.url.split('?')[0] ?? '')) return;
    if (!isValidApiKey(request.headers['x-api-key'])) {
      return reply.status(401).send({ success: false, error: 'Unauthorized' });
    }
  });

  // Error handler
  fastify.setErrorHandler((error: FastifyError, _request: FastifyRequest, reply: FastifyReply) => {
    fastify.log.error(error);
    reply.status(error.statusCode ?? 500).send({
      success: false,
      error: error.message,
    });
  });

  // Health check
  fastify.get('/api/health', async (_request, reply) => {
    reply.send({
      status: 'ok',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  });

  // Lets clients verify their API key
  fastify.get('/api/auth/check', async (_request, reply) => {
    reply.send({ success: true });
  });

  // Market data diagnostics — verify external API providers
  fastify.get<{ Params: { ticker: string } }>('/api/market/stocks/:ticker', getStockPriceHandler);
  fastify.get<{ Params: { ticker: string } }>('/api/market/crypto/:ticker', getCryptoPriceHandler);
  fastify.get<{ Params: { ticker: string } }>('/api/market/forex/:ticker', getForexPriceHandler);

  fastify.post('/api/createNote', createNoteHandler);
  fastify.post('/api/updateDeal', updateDealHandler);
  fastify.get('/api/deals', getDealsHandler);
  fastify.get<{ Params: { id: string } }>('/api/deals/:id', getDealByIdHandler);
  fastify.post<{ Params: { id: string } }>('/api/deals/:id/comments', addDealCommentHandler);
  fastify.get('/api/dashboard', getDashboardHandler);
  fastify.post('/api/sendAlert', sendAlertHandler);
  fastify.post('/api/uploadScreenshot', uploadScreenshotHandler);

  fastify.post('/api/analysis', { config: { timeout: 60000 } }, createAnalysisHandler);
  fastify.get('/api/analysis', getAnalysisReportsHandler);
  fastify.get('/api/analysis/latest', getLatestAnalysisHandler);
  fastify.get<{ Params: { id: string } }>('/api/analysis/:id', getAnalysisReportByIdHandler);

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
