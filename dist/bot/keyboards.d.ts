import type TelegramBot from 'node-telegram-bot-api';
export declare function getDealActionKeyboard(dealId: number): TelegramBot.InlineKeyboardMarkup;
export declare function getMarketsKeyboard(): TelegramBot.InlineKeyboardMarkup;
export declare function getCloseResultKeyboard(dealId: number): TelegramBot.InlineKeyboardMarkup;
