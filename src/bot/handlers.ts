import TelegramBot from 'node-telegram-bot-api';
import { config } from '../config';
import { initTelegramService, sendText } from '../services/telegramService';
import * as dealService from '../services/dealService';
import * as marketDataService from '../services/marketDataService';
import * as calculationService from '../services/calculationService';
import * as claudeService from '../services/claudeService';
import { getDealActionKeyboard, getMarketsKeyboard } from './keyboards';

let bot: TelegramBot;

function isAllowed(userId: number): boolean {
  return config.telegram.allowedUsers.includes(userId);
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
    if (!isAllowed(msg.from?.id ?? 0)) return;
    initTelegramService(bot, msg.chat.id);
    await bot.sendMessage(
      msg.chat.id,
      '👋 *ZY Trading Bot*\nВыбери рынок:',
      { parse_mode: 'Markdown', reply_markup: getMarketsKeyboard() },
    );
  });

  bot.onText(/\/deals/, async (msg) => {
    if (!isAllowed(msg.from?.id ?? 0)) return;
    try {
      const deals = await dealService.getDeals({ limit: 5 });
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
    if (!isAllowed(msg.from?.id ?? 0)) return;
    try {
      const stats = await dealService.getDashboardStats();
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
    if (!isAllowed(msg.from?.id ?? 0)) return;
    const id = Number(match?.[1]);
    if (!id) return;
    try {
      const deal = await dealService.getDealById(id);
      if (!deal) {
        await bot.sendMessage(msg.chat.id, `Сделка #${id} не найдена.`);
        return;
      }
      const lines: string[] = [
        formatDealSummary(deal),
        `TP: ${deal.calcResult.takeProfitDefault} | SL: ${deal.calcResult.stopLossDefault}`,
      ];
      if (deal.claudeCheckResult) {
        lines.push(`🤖 Claude: ${deal.claudeCheckResult.recommendation} (${deal.claudeCheckResult.confidence}%)`);
        lines.push(`_${deal.claudeCheckResult.reasoning}_`);
      }
      await bot.sendMessage(msg.chat.id, lines.join('\n'), { parse_mode: 'Markdown' });
    } catch (err) {
      console.error('[bot /deal]', err);
      await bot.sendMessage(msg.chat.id, `❌ Ошибка: ${(err as Error).message}`);
    }
  });

  // Manual input: BTCUSDT,45000,long,44000
  bot.onText(/^([A-Za-z0-9]+),(\d+(?:\.\d+)?),(long|short)(?:,(\d+(?:\.\d+)?))?$/, async (msg, match) => {
    if (!isAllowed(msg.from?.id ?? 0) || !match) return;

    const ticker = (match[1] ?? '').toUpperCase();
    const entryRaw = Number(match[2]);
    const direction = match[3] as 'long' | 'short';
    const customStop = match[4] ? Number(match[4]) : undefined;

    try {
      await bot.sendMessage(msg.chat.id, `⏳ Обрабатываю ${ticker}...`);

      const isDuplicate = await dealService.checkDuplicate(ticker, entryRaw, direction);
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

      const id = await dealService.createDeal(payload, calcResult);
      const ohlcvSummary = marketDataService.formatOhlcvSummary(bars);
      const claudeCheck = await claudeService.checkSetup({
        ticker,
        marketType: 'crypto',
        strategy: 'Пробой',
        direction,
        calcResult,
        checklist: { plus: [], minus: [], wait: [] },
        ohlcvSummary,
      });

      await dealService.setClaudeCheck(id, claudeCheck);
      await dealService.updateDealStatus(id, 'notified');

      const deal = await dealService.getDealById(id);
      if (!deal) throw new Error('Deal not found after creation');

      const keyboard = getDealActionKeyboard(id);
      const text = require('../services/telegramService').formatScenarioMessage(
        deal, calcResult, claudeCheck, undefined,
      );
      await bot.sendMessage(msg.chat.id, text, {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
      });
    } catch (err) {
      console.error('[bot manual input]', err);
      await bot.sendMessage(msg.chat.id, `❌ Ошибка: ${(err as Error).message}`);
    }
  });

  // Callback query handler
  bot.on('callback_query', async (query) => {
    if (!isAllowed(query.from.id)) return;
    const data = query.data ?? '';

    try {
      if (data.startsWith('entered_')) {
        const id = parseInt(data.replace('entered_', ''), 10);
        await dealService.updateDealStatus(id, 'entered', { hasDeal: true });
        await bot.answerCallbackQuery(query.id, { text: '✅ Отмечено: Вошёл' });
      } else if (data.startsWith('missed_')) {
        const id = parseInt(data.replace('missed_', ''), 10);
        await dealService.updateDealStatus(id, 'missed');
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

export function getBot(): TelegramBot {
  return bot;
}

export function sendTelegramText(chatId: number, text: string): Promise<TelegramBot.Message> {
  return bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
}
