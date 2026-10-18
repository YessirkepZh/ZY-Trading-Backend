/**
 * Standalone Claude job worker (no HTTP, no Telegram polling).
 * Use when CLAUDE_WORKER_EMBEDDED=false on the API service.
 *
 * Railway: second service, same repo, start command `npm run worker`.
 * $0 extra software — only another process/replica usage.
 */
import TelegramBot from 'node-telegram-bot-api';
import { config } from './config';
import { pool } from './db/pool';
import { startClaudeWorker } from './modules/ai';
import { initChecklistCache } from './modules/checklists';
import { initTelegramService } from './modules/telegram/telegramService';

async function main(): Promise<void> {
  await pool.query('SELECT 1');
  console.log('[worker] DB connected');

  await initChecklistCache();
  console.log('[worker] Checklist cache loaded');

  // Send-only bot for notifyNewDeal after check_setup (no polling — API owns /start etc.)
  if (config.telegram.enabled && config.telegram.token) {
    const bot = new TelegramBot(config.telegram.token, { polling: false });
    initTelegramService(bot, config.telegram.allowedUsers[0] ?? 0);
    console.log('[worker] Telegram send-only ready');
  } else {
    console.warn('[worker] Telegram disabled — deal notifications will be skipped');
  }

  if (!config.claudeQueue.enabled) {
    console.error('[worker] CLAUDE_QUEUE_ENABLED=false — nothing to do');
    process.exit(1);
  }

  startClaudeWorker();
  console.log('[worker] Claude queue poller running');
}

main().catch((err) => {
  console.error('[worker] Fatal:', err);
  process.exit(1);
});
