import TelegramBot from 'node-telegram-bot-api';
export declare function initBot(): void;
export declare function getBot(): TelegramBot;
export declare function sendTelegramText(chatId: number, text: string): Promise<TelegramBot.Message>;
