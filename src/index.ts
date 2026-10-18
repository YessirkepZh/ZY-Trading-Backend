import Fastify from 'fastify';
import cors from '@fastify/cors';
import { config } from './config';
import { registerRoutes } from './app/routes';
import { pool } from './db/pool';
import { startClaudeWorker } from './modules/ai';
import { initChecklistCache } from './modules/checklists';
import { initBot } from './modules/telegram';

const fastify = Fastify({
  bodyLimit: 10 * 1024 * 1024, // 10MB for base64 screenshots
  logger: {
    level: config.nodeEnv === 'production' ? 'info' : 'debug',
  },
});

async function main(): Promise<void> {
  // Verify DB connection
  await pool.query('SELECT 1');
  fastify.log.info('DB connected');

  // Load checklist items into memory
  await initChecklistCache();
  fastify.log.info('Checklist cache loaded');

  await fastify.register(cors, {
    origin: config.corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // Register all API routes
  await registerRoutes(fastify);

  // Start Telegram Bot (polling)
  if (config.telegram.enabled) {
    initBot();
  } else {
    fastify.log.warn('Telegram bot disabled (BOT_ENABLED=false)');
  }

  // Claude worker: embedded by default; set CLAUDE_WORKER_EMBEDDED=false + `npm run worker`
  if (config.claudeQueue.enabled && config.claudeQueue.embedded) {
    startClaudeWorker();
    fastify.log.info('Claude worker embedded in API process');
  } else if (config.claudeQueue.enabled) {
    fastify.log.info('Claude worker not embedded — run standalone: npm run worker');
  } else {
    fastify.log.warn('Claude queue disabled (CLAUDE_QUEUE_ENABLED=false)');
  }

  // Start HTTP server
  await fastify.listen({ port: config.port, host: '0.0.0.0' });
  fastify.log.info(`Server listening on port ${config.port}`);
  if (!config.cronSecret) {
    fastify.log.warn('CRON_SECRET is not set — POST /api/internal/reminders will return 503');
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
