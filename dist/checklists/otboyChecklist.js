"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.otboyChecklist = void 0;
exports.otboyChecklist = {
    ПРЕДПОСЫЛКИ: [
        { key: 'otboy_touch_level', label: 'Касание уровня поддержки / сопротивления' },
        { key: 'otboy_volume_at_level', label: 'Объём при касании уровня' },
        { key: 'otboy_divergence', label: 'Дивергенция индикатора с ценой' },
        { key: 'otboy_structure', label: 'Структура рынка за разворот от уровня' },
        { key: 'otboy_trend_align', label: 'Тест уровня по тренду' },
        { key: 'otboy_clean_level', label: 'Чистый уровень без пробоев в прошлом' },
    ],
    МИНУСЫ: [
        { key: 'otboy_prev_break', label: 'Уровень уже был пробит ранее' },
        { key: 'otboy_no_zone', label: 'Нет зоны накопления у уровня' },
        { key: 'otboy_counter_trend', label: 'Движение против основного тренда' },
        { key: 'otboy_wide_spread', label: 'Широкий спред свечей (нестабильность)' },
        { key: 'otboy_news_risk', label: 'Предстоящая новость создаёт риск' },
    ],
    ОЖИДАЮ: [
        { key: 'otboy_wait_engulf', label: 'Свеча поглощения от уровня' },
        { key: 'otboy_wait_pin_bar', label: 'Пин-бар / хаммер у уровня' },
        { key: 'otboy_wait_close_at_level', label: 'Закрытие свечи у уровня без пробоя' },
        { key: 'otboy_wait_retest_mini', label: 'Мини-ретест после отбоя' },
    ],
};
//# sourceMappingURL=otboyChecklist.js.map