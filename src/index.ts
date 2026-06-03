import Fastify from 'fastify';
import { config } from './config';
import { registerRoutes } from './api/routes';
import { initBot } from './bot/handlers';
import { pool } from './db/pool';

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


  // Register all API routes
  await registerRoutes(fastify);

  // Start Telegram Bot (polling)
  initBot();

  // Start HTTP server
  await fastify.listen({ port: config.port, host: '0.0.0.0' });
  fastify.log.info(`Server listening on port ${config.port}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
