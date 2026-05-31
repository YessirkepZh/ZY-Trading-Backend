"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initTelegramService = initTelegramService;
exports.formatScenarioMessage = formatScenarioMessage;
exports.sendScenario = sendScenario;
exports.sendText = sendText;
exports.sendAlert = sendAlert;
const checklists_1 = require("../checklists");
let botInstance = null;
let chatIdInstance = null;
function initTelegramService(bot, chatId) {
    botInstance = bot;
    chatIdInstance = chatId;
}
function getBot() {
    if (!botInstance)
        throw new Error('Telegram bot not initialized');
    return botInstance;
}
function getChatId() {
    if (chatIdInstance === null)
        throw new Error('Telegram chatId not set');
    return chatIdInstance;
}
// ── Formatters ────────────────────────────────────────────────────────────────
function formatChecklistLine(strategy, keys, icon, label) {
    if (keys.length === 0)
        return '';
    const items = keys.map((k) => (0, checklists_1.getLabelByKey)(strategy, k)).join(', ');
    return `${icon} *${label}:* ${items}`;
}
function formatScenarioMessage(deal, calcResult, claudeCheck, checklist) {
    const { ticker, marketType, strategy, direction, entryRaw, id } = deal;
    const passRoadStr = calcResult.passRoad !== null
        ? `${calcResult.passRoad.toFixed()}%`
        : 'н/д';
    const passRoadWarning = calcResult.passRoad !== null && calcResult.passRoad > 60
        ? `\n⚠️ Пройдено ${calcResult.passRoad.toFixed()}% ATR — риск/доходность снижены`
        : '';
    const lines = [
        `📈 *Сценарий ${strategy}*`,
        '',
        `• *Маркет:* ${marketType}`,
        `• *Тикер:* ${ticker}`,
        `• *Направление:* ${direction}`,
        `• *Уровень:* ${entryRaw}`,
        `• *ATR:* ${calcResult.atr}`,
        `• *Запас хода до:* ${calcResult.rangeReserve ?? 'н/д'}`,
        `• *Прошёл от ATR:* ${passRoadStr}${passRoadWarning}`,
        '',
        `• *ТВХ расчётный:* ${calcResult.entryPrice}`,
        `• *SL расчётный:* ${calcResult.stopLossDefault}`,
        `• *TP расчётный:* ${calcResult.takeProfitDefault}`,
        `• *Количество:* ${calcResult.quantity}`,
        `• *Сумма:* ${calcResult.sum}`,
    ];
    if (calcResult.entryPriceByStop !== undefined &&
        calcResult.stopLossByStop !== undefined &&
        calcResult.takeProfitByStop !== undefined) {
        lines.push('');
        lines.push(`• *ТВХ технический:* ${calcResult.entryPriceByStop}`);
        lines.push(`• *SL технический:* ${calcResult.stopLossByStop}`);
        lines.push(`• *TP технический:* ${calcResult.takeProfitByStop}`);
        if (calcResult.takeProfitByStop2 !== undefined) {
            lines.push(`• *TP 4к1:* ${calcResult.takeProfitByStop2}`);
        }
        if (calcResult.takeProfitByStop3 !== undefined) {
            lines.push(`• *TP 5к1:* ${calcResult.takeProfitByStop3}`);
        }
    }
    lines.push('');
    lines.push(`🤖 *Claude: ${claudeCheck.recommendation}* (${claudeCheck.confidence}%)`);
    lines.push(`_${claudeCheck.reasoning}_`);
    if (checklist && strategy) {
        const plusLine = formatChecklistLine(strategy, checklist.plus, '✅', 'ПРЕДПОСЫЛКИ');
        const minusLine = formatChecklistLine(strategy, checklist.minus, '❌', 'МИНУСЫ');
        const waitLine = formatChecklistLine(strategy, checklist.wait, '⏳', 'ОЖИДАЮ');
        if (plusLine || minusLine || waitLine) {
            lines.push('');
            lines.push('🧾 *Чек-лист*');
            if (plusLine)
                lines.push(plusLine);
            if (minusLine)
                lines.push(minusLine);
            if (waitLine)
                lines.push(waitLine);
        }
    }
    lines.push('');
    lines.push(`ID: #${id}`);
    return lines.filter((l) => l !== undefined).join('\n');
}
// ── Send actions ──────────────────────────────────────────────────────────────
async function sendScenario(deal, calcResult, claudeCheck, checklist, keyboard) {
    const bot = getBot();
    const chatId = getChatId();
    const text = formatScenarioMessage(deal, calcResult, claudeCheck, checklist);
    await bot.sendMessage(chatId, text, {
        parse_mode: 'Markdown',
        reply_markup: keyboard,
    });
}
async function sendText(text) {
    const bot = getBot();
    const chatId = getChatId();
    await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
}
async function sendAlert(text) {
    return sendText(`🔔 ${text}`);
}
//# sourceMappingURL=telegramService.js.map