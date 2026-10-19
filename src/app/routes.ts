import type { FastifyInstance, FastifyRequest, FastifyReply, FastifyError } from 'fastify';
import { registerAuth } from '../modules/auth';
import { registerDealRoutes } from '../modules/deals';
import { copyChecklistItems, registerChecklistRoutes } from '../modules/checklists';
import { registerAnalyticsRoutes } from '../modules/analytics';
import { registerMarketRoutes } from '../modules/market';
import { registerReminderRoutes } from '../modules/reminders';
import { registerAiRoutes } from '../modules/ai';
import { notifyNewDeal, registerTelegramRoutes } from '../modules/telegram';
import { forkDefaultsForUser, registerTradingSettingsRoutes } from '../modules/tradingSettings';

export async function registerRoutes(fastify: FastifyInstance): Promise<void> {
  registerAuth(fastify, {
    onUserCreated: async (userId, invitedBy) => {
      await forkDefaultsForUser(userId);
      await copyChecklistItems(invitedBy, userId);
    },
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

  registerMarketRoutes(fastify);
  registerDealRoutes(fastify, { notifier: { notifyNewDeal } });
  registerAnalyticsRoutes(fastify);
  registerAiRoutes(fastify);
  registerTradingSettingsRoutes(fastify);
  registerTelegramRoutes(fastify);
  registerChecklistRoutes(fastify);
  registerReminderRoutes(fastify);
}
