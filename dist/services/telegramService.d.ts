import type TelegramBot from 'node-telegram-bot-api';
import type { Deal } from '../types/deal';
import type { CalculationResult, ClaudeCheckResult } from '../types/calculation';
import type { ChecklistSnapshot } from '../types/deal';
export declare function initTelegramService(bot: TelegramBot, chatId: number): void;
export declare function formatScenarioMessage(deal: Deal, calcResult: CalculationResult, claudeCheck: ClaudeCheckResult, checklist?: ChecklistSnapshot): string;
export declare function sendScenario(deal: Deal, calcResult: CalculationResult, claudeCheck: ClaudeCheckResult, checklist: ChecklistSnapshot | undefined, keyboard: TelegramBot.InlineKeyboardMarkup): Promise<void>;
export declare function sendText(text: string): Promise<void>;
export declare function sendAlert(text: string): Promise<void>;
