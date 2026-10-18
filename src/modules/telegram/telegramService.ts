import type TelegramBot from 'node-telegram-bot-api';
import type { ChecklistSnapshot, Strategy } from '../../shared/trading';
import type { ClaudeCheckResult } from '../ai';
import { findOwner, findUserById } from '../auth';
import { getLabelByKey } from '../checklists';
import { calculationService, type CalculationResult, type Deal } from '../deals';
import {
  formatClaudeReasoningRu,
  formatClaudeRecommendationRu,
} from './claudeDisplay';
import { getDealActionKeyboard } from './keyboards';

let botInstance: TelegramBot | null = null;
// Chat of the ALLOWED_USERS owner, used until the owner links a telegram_id
let legacyChatId: number | null = null;

export function initTelegramService(bot: TelegramBot, chatId: number): void {
  botInstance = bot;
  legacyChatId = chatId;
}

function getBot(): TelegramBot | null {
  return botInstance;
}

async function resolveChatId(userId: number): Promise<number | null> {
  const user = await findUserById(userId);
  if (user?.telegramId) return user.telegramId;
  const owner = await findOwner();
  return owner?.id === userId ? legacyChatId : null;
}

// ── Formatters ────────────────────────────────────────────────────────────────

function formatChecklistLine(
  userId: number,
  strategy: Strategy,
  keys: string[],
  icon: string,
  label: string,
): string {
  if (keys.length === 0) return '';
  const items = keys.map((k) => getLabelByKey(userId, strategy, k)).join(', ');
  return `${icon} *${label}:* ${items}`;
}

export function formatScenarioMessage(
  deal: Deal,
  calcResult: CalculationResult,
  claudeCheck: ClaudeCheckResult,
  checklist?: ChecklistSnapshot,
): string {
  const { ticker, marketType, strategy, direction, entryRaw, id, userId } = deal;
  const passRoadStr = calcResult.passRoad !== null
    ? `${calcResult.passRoad.toFixed()}%`
    : 'н/д';
  const passRoadWarningText = calcResult.passRoad !== null
    ? calculationService.getPassRoadWarning(calcResult.passRoad, strategy, calcResult.atrPercent ?? undefined)
    : null;
  const showPassRoadWarning = passRoadWarningText != null &&
    !(strategy === 'Ложный Пробой' && calcResult.passRoad != null && calcResult.passRoad < 400);
  const passRoadWarning = showPassRoadWarning
    ? `\n⚠️ ${passRoadWarningText}`
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
    if (calcResult.quantityByStop !== undefined) {
      lines.push(`• *Количество:* ${calcResult.quantityByStop}`);
    }
    if (calcResult.sumByStop !== undefined) {
      lines.push(`• *Сумма:* ${calcResult.sumByStop}`);
    }
  }

  lines.push('');
  lines.push(
    `🤖 *Claude: ${formatClaudeRecommendationRu(claudeCheck.recommendation)}* (${claudeCheck.confidence}%)`,
  );
  lines.push(`_${formatClaudeReasoningRu(claudeCheck)}_`);

  const warnings = claudeCheck.warningsRu ?? claudeCheck.warnings;
  if (warnings.length > 0) {
    lines.push('');
    lines.push('⚠️ *Предупреждения*');
    for (const w of warnings) {
      lines.push(`• ${w}`);
    }
  }

  if (checklist && strategy) {
    const plusLine = formatChecklistLine(userId, strategy, checklist.plus, '✅', 'ПРЕДПОСЫЛКИ');
    const minusLine = formatChecklistLine(userId, strategy, checklist.minus, '❌', 'МИНУСЫ');
    const waitLine = formatChecklistLine(userId, strategy, checklist.wait, '⏳', 'ОЖИДАЮ');

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
  if (!bot) return;
  const chatId = await resolveChatId(deal.userId);
  if (chatId === null) return;
  const text = formatScenarioMessage(deal, calcResult, claudeCheck, checklist);

  await bot.sendMessage(chatId, text, {
    parse_mode: 'Markdown',
    reply_markup: keyboard,
  });
}

export async function notifyNewDeal(
  deal: Deal,
  calcResult: CalculationResult,
  claudeCheck: ClaudeCheckResult,
  checklist: ChecklistSnapshot | undefined,
): Promise<void> {
  await sendScenario(deal, calcResult, claudeCheck, checklist, getDealActionKeyboard(deal.id));
}

/** Returns false when the user has no linked Telegram chat */
export async function sendText(userId: number, text: string): Promise<boolean> {
  const bot = getBot();
  if (!bot) return false;
  const chatId = await resolveChatId(userId);
  if (chatId === null) return false;
  await bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
  return true;
}

export async function sendAlert(userId: number, text: string): Promise<boolean> {
  return sendText(userId, `🔔 ${text}`);
}

async function sendMarkdown(
  userId: number,
  text: string,
  replyMarkup?: TelegramBot.InlineKeyboardMarkup,
): Promise<boolean> {
  if (!botInstance) return false;
  const chatId = await resolveChatId(userId);
  if (chatId === null) return false;
  await botInstance.sendMessage(chatId, text, {
    parse_mode: 'Markdown',
    reply_markup: replyMarkup,
  });
  return true;
}

/** Stuck setup: still created/notified after 1h / 4h / 24h */
export async function sendSetupReminder(
  userId: number,
  deal: { id: number; ticker: string; stageHours: number; url: string },
): Promise<boolean> {
  const text = [
    `🔔 *Напоминание · сетап*`,
    ``,
    `*${deal.ticker}* #${deal.id} без решения уже ~${deal.stageHours}ч.`,
    `Вошли в сделку или пропустили?`,
    ``,
    `[Открыть сделку](${deal.url})`,
  ].join('\n');

  return sendMarkdown(userId, text, getDealActionKeyboard(deal.id));
}

/** Setup older than 3 days — marked missed automatically */
export async function sendSetupAutoMissedNotice(
  userId: number,
  deal: { id: number; ticker: string; url: string },
): Promise<boolean> {
  const text = [
    `🗂 *Сетап закрыт как пропущенный*`,
    ``,
    `*${deal.ticker}* #${deal.id} висел без входа больше 3 дней — статус *missed*.`,
    ``,
    `[Открыть сделку](${deal.url})`,
  ].join('\n');
  return sendMarkdown(userId, text);
}

/** Open position without close after 1h / 4h / 24h */
export async function sendPositionReminder(
  userId: number,
  deal: { id: number; ticker: string; stageHours: number; url: string },
): Promise<boolean> {
  const text = [
    `🔔 *Напоминание · позиция*`,
    ``,
    `*${deal.ticker}* #${deal.id} в статусе *entered* уже ~${deal.stageHours}ч.`,
    `Закройте сделку в расширении или на сайте, когда выйдете.`,
    ``,
    `[Открыть сделку](${deal.url})`,
  ].join('\n');
  return sendMarkdown(userId, text);
}
