import type TelegramBot from 'node-telegram-bot-api';

export function getDealActionKeyboard(dealId: number): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: '✅ Вошёл', callback_data: `entered_${dealId}` },
        { text: '❌ Пропустил', callback_data: `missed_${dealId}` },
      ],
    ],
  };
}

export function getMarketsKeyboard(): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: '🪙 Крипто', callback_data: 'market_crypto' },
        { text: '📊 Акции', callback_data: 'market_stocks' },
        { text: '💱 Форекс', callback_data: 'market_forex' },
      ],
    ],
  };
}

export function getCloseResultKeyboard(dealId: number): TelegramBot.InlineKeyboardMarkup {
  return {
    inline_keyboard: [
      [
        { text: '✅ Победа', callback_data: `close_win_${dealId}` },
        { text: '❌ Убыток', callback_data: `close_loss_${dealId}` },
        { text: '➖ Безубыток', callback_data: `close_breakeven_${dealId}` },
      ],
    ],
  };
}
