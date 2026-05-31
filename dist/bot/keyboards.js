"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDealActionKeyboard = getDealActionKeyboard;
exports.getMarketsKeyboard = getMarketsKeyboard;
exports.getCloseResultKeyboard = getCloseResultKeyboard;
function getDealActionKeyboard(dealId) {
    return {
        inline_keyboard: [
            [
                { text: '✅ Вошёл', callback_data: `entered_${dealId}` },
                { text: '❌ Пропустил', callback_data: `missed_${dealId}` },
            ],
        ],
    };
}
function getMarketsKeyboard() {
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
function getCloseResultKeyboard(dealId) {
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
//# sourceMappingURL=keyboards.js.map