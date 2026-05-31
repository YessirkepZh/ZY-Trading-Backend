import type { FastifyInstance, FastifyRequest, FastifyReply, FastifyError } from 'fastify';
import { createNoteHandler } from './handlers/createNote';
import { updateDealHandler } from './handlers/updateDeal';
import { getDealsHandler } from './handlers/getDeals';
import { getDealByIdHandler } from './handlers/getDealById';
import { getDashboardHandler } from './handlers/getDashboard';
import { sendAlertHandler } from './handlers/sendAlert';
import { uploadScreenshotHandler } from './handlers/uploadScreenshot';

export async function registerRoutes(fastify: FastifyInstance): Promise<void> {
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

  fastify.post('/api/createNote', createNoteHandler);
  fastify.post('/api/updateDeal', updateDealHandler);
  fastify.get('/api/deals', getDealsHandler);
  fastify.get<{ Params: { id: string } }>('/api/deals/:id', getDealByIdHandler);
  fastify.get('/api/dashboard', getDashboardHandler);
  fastify.post('/api/sendAlert', sendAlertHandler);
  fastify.post('/api/uploadScreenshot', uploadScreenshotHandler);
}
