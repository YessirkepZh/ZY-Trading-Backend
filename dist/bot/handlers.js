"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initBot = initBot;
exports.getBot = getBot;
exports.sendTelegramText = sendTelegramText;
const node_telegram_bot_api_1 = __importDefault(require("node-telegram-bot-api"));
const config_1 = require("../config");
const telegramService_1 = require("../services/telegramService");
const dealService = __importStar(require("../services/dealService"));
const marketDataService = __importStar(require("../services/marketDataService"));
const calculationService = __importStar(require("../services/calculationService"));
const claudeService = __importStar(require("../services/claudeService"));
const keyboards_1 = require("./keyboards");
let bot;
function isAllowed(userId) {
    return config_1.config.telegram.allowedUsers.includes(userId);
}
function formatDealSummary(deal) {
    if (!deal)
        return 'Сделка не найдена';
    const result = deal.dealResult ? ` | ${deal.dealResult}` : '';
    return (`#${deal.id} *${deal.ticker}* ${deal.strategy} ${deal.direction}\n` +
        `Уровень: ${deal.entryRaw} | Статус: ${deal.status}${result}\n` +
        `passRoad: ${deal.calcResult.passRoad ?? 'н/д'}% | ATR: ${deal.calcResult.atr}`);
}
function initBot() {
    bot = new node_telegram_bot_api_1.default(config_1.config.telegram.token, { polling: true });
    // Expose bot to telegram service (first allowed user as default chat)
    // chatId will be set dynamically when a user sends /start
    (0, telegramService_1.initTelegramService)(bot, config_1.config.telegram.allowedUsers[0] ?? 0);
    bot.onText(/\/start/, async (msg) => {
        if (!isAllowed(msg.from?.id ?? 0))
            return;
        (0, telegramService_1.initTelegramService)(bot, msg.chat.id);
        await bot.sendMessage(msg.chat.id, '👋 *ZY Trading Bot*\nВыбери рынок:', { parse_mode: 'Markdown', reply_markup: (0, keyboards_1.getMarketsKeyboard)() });
    });
    bot.onText(/\/deals/, async (msg) => {
        if (!isAllowed(msg.from?.id ?? 0))
            return;
        try {
            const deals = await dealService.getDeals({ limit: 5 });
            if (deals.length === 0) {
                await bot.sendMessage(msg.chat.id, 'Сделок пока нет.');
                return;
            }
            const text = deals.map(formatDealSummary).join('\n\n');
            await bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
        }
        catch (err) {
            await bot.sendMessage(msg.chat.id, `❌ Ошибка: ${err.message}`);
        }
    });
    bot.onText(/\/stats/, async (msg) => {
        if (!isAllowed(msg.from?.id ?? 0))
            return;
        try {
            const stats = await dealService.getDashboardStats();
            const text = `📊 *Статистика*\n\n` +
                `Всего сделок: ${stats.totalDeals}\n` +
                `Win rate: ${stats.winRate}%\n` +
                `Avg passRoad (wins): ${stats.avgPassRoad}%`;
            await bot.sendMessage(msg.chat.id, text, { parse_mode: 'Markdown' });
        }
        catch (err) {
            await bot.sendMessage(msg.chat.id, `❌ Ошибка: ${err.message}`);
        }
    });
    bot.onText(/\/deal (\d+)/, async (msg, match) => {
        if (!isAllowed(msg.from?.id ?? 0))
            return;
        const id = Number(match?.[1]);
        if (!id)
            return;
        try {
            const deal = await dealService.getDealById(id);
            if (!deal) {
                await bot.sendMessage(msg.chat.id, `Сделка #${id} не найдена.`);
                return;
            }
            const lines = [
                formatDealSummary(deal),
                `TP: ${deal.calcResult.takeProfitDefault} | SL: ${deal.calcResult.stopLossDefault}`,
            ];
            if (deal.claudeCheckResult) {
                lines.push(`🤖 Claude: ${deal.claudeCheckResult.recommendation} (${deal.claudeCheckResult.confidence}%)`);
                lines.push(`_${deal.claudeCheckResult.reasoning}_`);
            }
            await bot.sendMessage(msg.chat.id, lines.join('\n'), { parse_mode: 'Markdown' });
        }
        catch (err) {
            await bot.sendMessage(msg.chat.id, `❌ Ошибка: ${err.message}`);
        }
    });
    // Manual input: BTCUSDT,45000,long,44000
    bot.onText(/^([A-Za-z0-9]+),(\d+(?:\.\d+)?),(long|short)(?:,(\d+(?:\.\d+)?))?$/, async (msg, match) => {
        if (!isAllowed(msg.from?.id ?? 0) || !match)
            return;
        const ticker = (match[1] ?? '').toUpperCase();
        const entryRaw = Number(match[2]);
        const direction = match[3];
        const customStop = match[4] ? Number(match[4]) : undefined;
        try {
            await bot.sendMessage(msg.chat.id, `⏳ Обрабатываю ${ticker}...`);
            const isDuplicate = await dealService.checkDuplicate(ticker, entryRaw, direction);
            if (isDuplicate) {
                await bot.sendMessage(msg.chat.id, '⚠️ Такой сетап уже создан (дубликат за 30 сек).');
                return;
            }
            const { bars } = await marketDataService.getMarketData(ticker, 'crypto');
            const calcResult = calculationService.calculateDeal({
                direction,
                entryRaw,
                riskPercent: config_1.config.risk.cryptoDefault,
                ratio: config_1.config.risk.ratio,
                luftPercent: config_1.config.risk.luftPercent,
                riskSum: config_1.config.risk.riskSum,
                customStop,
                bars,
            });
            const payload = {
                ticker,
                marketType: 'crypto',
                strategy: 'Пробой',
                direction,
                entryRaw,
                customStop,
                riskPercent: config_1.config.risk.cryptoDefault,
                ratio: config_1.config.risk.ratio,
                luftPercent: config_1.config.risk.luftPercent,
                riskSum: config_1.config.risk.riskSum,
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
            if (!deal)
                throw new Error('Deal not found after creation');
            const keyboard = (0, keyboards_1.getDealActionKeyboard)(id);
            const text = require('../services/telegramService').formatScenarioMessage(deal, calcResult, claudeCheck, undefined);
            await bot.sendMessage(msg.chat.id, text, {
                parse_mode: 'Markdown',
                reply_markup: keyboard,
            });
        }
        catch (err) {
            await bot.sendMessage(msg.chat.id, `❌ Ошибка: ${err.message}`);
        }
    });
    // Callback query handler
    bot.on('callback_query', async (query) => {
        if (!isAllowed(query.from.id))
            return;
        const data = query.data ?? '';
        try {
            if (data.startsWith('entered_')) {
                const id = parseInt(data.replace('entered_', ''), 10);
                await dealService.updateDealStatus(id, 'entered', { hasDeal: true });
                await bot.answerCallbackQuery(query.id, { text: '✅ Отмечено: Вошёл' });
            }
            else if (data.startsWith('missed_')) {
                const id = parseInt(data.replace('missed_', ''), 10);
                await dealService.updateDealStatus(id, 'missed');
                await bot.answerCallbackQuery(query.id, { text: '❌ Отмечено: Пропустил' });
            }
            else if (data.startsWith('market_')) {
                await bot.answerCallbackQuery(query.id, { text: 'Используй /api/createNote для ввода сетапа' });
            }
            else {
                await bot.answerCallbackQuery(query.id);
            }
        }
        catch (err) {
            await bot.answerCallbackQuery(query.id, { text: `Ошибка: ${err.message}` });
        }
    });
    bot.on('polling_error', (err) => {
        console.error('Telegram polling error:', err);
    });
    console.log('Telegram bot started (polling)');
}
function getBot() {
    return bot;
}
function sendTelegramText(chatId, text) {
    return bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
}
//# sourceMappingURL=handlers.js.map