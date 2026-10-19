import TelegramBot from 'node-telegram-bot-api';
import { config } from '../../config';
import {
  AiQuotaExceededError,
  claudeJobService,
  unavailableClaudeCheck,
} from '../ai';
import { notifyNewDeal } from './telegramService';
import { dashboardService } from '../analytics';
import { findOwner, findUserByTelegramId, type AuthUser } from '../auth';
import { calculationService, dealService } from '../deals';
import { marketDataService } from '../market';
import { initTelegramService } from './telegramService';
import {
  formatClaudeReasoningRu,
  formatClaudeRecommendationRu,
} from './claudeDisplay';
import { getDealActionKeyboard, getMarketsKeyboard } from './keyboards';

let bot: TelegramBot;

/** Linked account, or the owner for ALLOWED_USERS ids that are not linked yet */
async function resolveUser(telegramId: number | undefined): Promise<AuthUser | null> {
  if (!telegramId) return null;
  try {
    const linked = await findUserByTelegramId(telegramId);
    if (linked) return linked;
    return config.telegram.allowedUsers.includes(telegramId) ? await findOwner() : null;
  } catch (err) {
    console.error('[bot resolveUser]', err);
    return null;
  }
}

function formatDealSummary(deal: Awaited<ReturnType<typeof dealService.getDealById>>): string {
  if (!deal) return 'Сделка не найдена';
  const result = deal.dealResult ? ` | ${deal.dealResult}` : '';
  return (
    `#${deal.id} *${deal.ticker}* ${deal.strategy} ${deal.direction}\n` +
    `Уровень: ${deal.entryRaw} | Статус: ${deal.status}${result}\n` +
    `passRoad: ${deal.calcResult.passRoad ?? 'н/д'}% | ATR: ${deal.calcResult.atr}`
  );
}

export function initBot(): void {
  bot = new TelegramBot(config.telegram.token, { polling: true });

  // Expose bot to telegram service (first allowed user as default chat)
  // chatId will be set dynamically when a user sends /start
  initTelegramService(bot, config.telegram.allowedUsers[0] ?? 0);

  bot.onText(/\/start/, async (msg) => {
    if (!await resolveUser(msg.from?.id)) return;
    initTelegramService(bot, msg.chat.id);
    await bot.sendMessage(
      msg.chat.id,
      '👋 *ZY Trading Bot*\nВыбери рынок:',
      { parse_mode: 'Markdown', reply_markup: getMarketsKeyboard() },
    );
  });

  bot.onText(/\/deals/, async (msg) => {
    const user = await resolveUser(msg.from?.id);
    if (!user) return;
    try {
      const deals = await dealService.getDeals(user.id, { limit: 5 });
      if (deals.length === 0) {
        await bot.sendMessage(msg.chat.id, 'Сделок пока нет.');
        return;
      }
      const text = deals.map(formatDealSummary).join('\n\n');
      await bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
    } catch (err) {
      console.error('[bot /deals]', err);
      await bot.sendMessage(msg.chat.id, `❌ Ошибка: ${(err as Error).message}`);
    }
  });

  bot.onText(/\/stats/, async (msg) => {
    const user = await resolveUser(msg.from?.id);
    if (!user) return;
    try {
      const stats = await dashboardService.getDashboardStats(user.id);
      const text =
        `📊 *Статистика*\n\n` +
        `Всего сделок: ${stats.totalDeals}\n` +
        `Win rate: ${stats.winRate}%\n` +
        `Avg passRoad (wins): ${stats.avgPassRoad}%`;
      await bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
    } catch (err) {
      console.error('[bot /stats]', err);
      await bot.sendMessage(msg.chat.id, `❌ Ошибка: ${(err as Error).message}`);
    }
  });

  bot.onText(/\/deal (\d+)/, async (msg, match) => {
    const user = await resolveUser(msg.from?.id);
    if (!user) return;
    const id = Number(match?.[1]);
    if (!id) return;
    try {
      const deal = await dealService.getDealById(user.id, id);
      if (!deal) {
        await bot.sendMessage(msg.chat.id, `Сделка #${id} не найдена.`);
        return;
      }
      const lines: string[] = [
        formatDealSummary(deal),
        `TP: ${deal.calcResult.takeProfitDefault} | SL: ${deal.calcResult.stopLossDefault}`,
      ];
      if (deal.claudeCheckResult) {
        const rec = formatClaudeRecommendationRu(deal.claudeCheckResult.recommendation);
        lines.push(`🤖 Claude: ${rec} (${deal.claudeCheckResult.confidence}%)`);
        lines.push(`_${formatClaudeReasoningRu(deal.claudeCheckResult)}_`);
      }
      await bot.sendMessage(msg.chat.id, lines.join('\n'), { parse_mode: 'Markdown' });
    } catch (err) {
      console.error('[bot /deal]', err);
      await bot.sendMessage(msg.chat.id, `❌ Ошибка: ${(err as Error).message}`);
    }
  });

  // Manual input: BTCUSDT,45000,long,44000
  bot.onText(/^([A-Za-z0-9]+),(\d+(?:\.\d+)?),(long|short)(?:,(\d+(?:\.\d+)?))?$/, async (msg, match) => {
    if (!match) return;
    const user = await resolveUser(msg.from?.id);
    if (!user) return;

    const ticker = (match[1] ?? '').toUpperCase();
    const entryRaw = Number(match[2]);
    const direction = match[3] as 'long' | 'short';
    const customStop = match[4] ? Number(match[4]) : undefined;

    try {
      await bot.sendMessage(msg.chat.id, `⏳ Обрабатываю ${ticker}...`);

      const isDuplicate = await dealService.checkDuplicate(user.id, ticker, entryRaw, direction);
      if (isDuplicate) {
        await bot.sendMessage(msg.chat.id, '⚠️ Такой сетап уже создан (дубликат за 30 сек).');
        return;
      }

      const { bars, currentBar } = await marketDataService.getMarketData(ticker, 'crypto');
      const calcResult = calculationService.calculateDeal({
        direction,
        entryRaw,
        riskPercent: config.risk.cryptoDefault,
        ratio: config.risk.ratio,
        luftPercent: config.risk.luftPercent,
        riskSum: config.risk.riskSum,
        customStop,
        bars,
        currentBar,
      });

      const payload = {
        ticker,
        marketType: 'crypto' as const,
        strategy: 'Пробой' as const,
        direction,
        entryRaw,
        customStop,
        riskPercent: config.risk.cryptoDefault,
        ratio: config.risk.ratio,
        luftPercent: config.risk.luftPercent,
        riskSum: config.risk.riskSum,
      };

      const id = await dealService.createDeal(user.id, payload, calcResult);
      const ohlcvSummary = marketDataService.formatOhlcvSummary(bars);
      const lossStreak = await dealService.getCurrentLossStreak(user.id);
      const emptyChecklist = { plus: [] as string[], minus: [] as string[], wait: [] as string[] };
      try {
        await claudeJobService.enqueueJob({
          userId: user.id,
          dealId: id,
          jobType: 'check_setup',
          payload: {
            ticker,
            marketType: 'crypto',
            strategy: 'Пробой',
            direction,
            entryRaw,
            calcResult,
            checklist: emptyChecklist,
            ohlcvSummary,
            lossStreak,
            notifyTelegram: true,
          },
        });
        await bot.sendMessage(
          msg.chat.id,
          `✅ Сделка #${id} (${ticker}) создана. Claude проверяет сетап — полный разбор придёт следом.`,
        );
      } catch (err) {
        if (!(err instanceof AiQuotaExceededError)) throw err;
        const claudeCheck = unavailableClaudeCheck(
          `Лимит AI на сегодня (${err.used}/${err.limit}). Расчёт без проверки Claude.`,
        );
        await dealService.setClaudeCheck(id, claudeCheck);
        await dealService.updateDealStatus(id, 'notified');
        const deal = await dealService.getDealById(user.id, id);
        if (deal) await notifyNewDeal(deal, calcResult, claudeCheck, emptyChecklist);
        await bot.sendMessage(
          msg.chat.id,
          `✅ Сделка #${id} создана без Claude: ${err.message}`,
        );
      }
    } catch (err) {
      console.error('[bot manual input]', err);
      await bot.sendMessage(msg.chat.id, `❌ Ошибка: ${(err as Error).message}`);
    }
  });

  // Callback query handler
  bot.on('callback_query', async (query) => {
    const user = await resolveUser(query.from.id);
    if (!user) return;
    const data = query.data ?? '';

    try {
      const dealAction = data.match(/^(entered|missed)_(\d+)$/);
      const deal = dealAction ? await dealService.getDealById(user.id, Number(dealAction[2])) : null;
      if (dealAction && !deal) {
        await bot.answerCallbackQuery(query.id, { text: 'Сделка не найдена' });
      } else if (deal && dealAction?.[1] === 'entered') {
        await dealService.updateDealStatus(deal.id, 'entered', { hasDeal: true });
        await bot.answerCallbackQuery(query.id, { text: '✅ Отмечено: Вошёл' });
      } else if (deal && dealAction?.[1] === 'missed') {
        await dealService.updateDealStatus(deal.id, 'missed');
        await bot.answerCallbackQuery(query.id, { text: '❌ Отмечено: Пропустил' });
      } else if (data.startsWith('market_')) {
        await bot.answerCallbackQuery(query.id, { text: 'Используй /api/createNote для ввода сетапа' });
      } else {
        await bot.answerCallbackQuery(query.id);
      }
    } catch (err) {
      console.error('[bot callback_query]', err);
      await bot.answerCallbackQuery(query.id, { text: `Ошибка: ${(err as Error).message}` });
    }
  });

  bot.on('polling_error', (err) => {
    console.error('Telegram polling error:', err);
  });

  console.log('Telegram bot started (polling)');
}
