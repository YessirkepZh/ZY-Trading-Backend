import type TelegramBot from 'node-telegram-bot-api';
import { getLabelByKey } from '../checklists';
import type { Deal } from '../types/deal';
import type { CalculationResult, ClaudeCheckResult } from '../types/calculation';
import type { ChecklistSnapshot, Strategy } from '../types/deal';

let botInstance: TelegramBot | null = null;
let chatIdInstance: number | null = null;

export function initTelegramService(bot: TelegramBot, chatId: number): void {
  botInstance = bot;
  chatIdInstance = chatId;
}

function getBot(): TelegramBot {
  if (!botInstance) throw new Error('Telegram bot not initialized');
  return botInstance;
}

function getChatId(): number {
  if (chatIdInstance === null) throw new Error('Telegram chatId not set');
  return chatIdInstance;
}

// ── Formatters ────────────────────────────────────────────────────────────────

function formatChecklistLine(
  strategy: Strategy,
  keys: string[],
  icon: string,
  label: string,
): string {
  if (keys.length === 0) return '';
  const items = keys.map((k) => getLabelByKey(strategy, k)).join(', ');
  return `${icon} *${label}:* ${items}`;
}

export function formatScenarioMessage(
  deal: Deal,
  calcResult: CalculationResult,
  claudeCheck: ClaudeCheckResult,
  checklist?: ChecklistSnapshot,
): string {
  const { ticker, marketType, strategy, direction, entryRaw, id } = deal;
  const passRoadStr = calcResult.passRoad !== null
    ? `${calcResult.passRoad.toFixed()}%`
    : 'н/д';
  const passRoadWarning =
    calcResult.passRoad !== null && calcResult.passRoad > 60
      ? `\n⚠️ Пройдено ${calcResult.passRoad.toFixed()}% ATR — риск/доходность снижены`
      : '';

  const lines: string[] = [
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

  if (
    calcResult.entryPriceByStop !== undefined &&
    calcResult.stopLossByStop !== undefined &&
    calcResult.takeProfitByStop !== undefined
  ) {
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
      if (plusLine) lines.push(plusLine);
      if (minusLine) lines.push(minusLine);
      if (waitLine) lines.push(waitLine);
    }
  }

  lines.push('');
  lines.push(`ID: #${id}`);

  return lines.filter((l) => l !== undefined).join('\n');
}

// ── Send actions ──────────────────────────────────────────────────────────────

export async function sendScenario(
  deal: Deal,
  calcResult: CalculationResult,
  claudeCheck: ClaudeCheckResult,
  checklist: ChecklistSnapshot | undefined,
  keyboard: TelegramBot.InlineKeyboardMarkup,
): Promise<void> {
  const bot = getBot();
  const chatId = getChatId();
  const text = formatScenarioMessage(deal, calcResult, claudeCheck, checklist);

  await bot.sendMessage(chatId, text, {
    parse_mode: 'Markdown',
    reply_markup: keyboard,
  });
}

export async function sendText(text: string): Promise<void> {
  const bot = getBot();
  const chatId = getChatId();
  await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
}

export async function sendAlert(text: string): Promise<void> {
  return sendText(`🔔 ${text}`);
}
