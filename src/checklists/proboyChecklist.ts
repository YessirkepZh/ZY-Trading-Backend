import type { Checklist } from './index';

export const proboyChecklist: Checklist = {
  ПРЕДПОСЫЛКИ: [
    { key: 'proboy_squeeze', label: 'Поджатие к уровню на малых барах' },
    { key: 'proboy_accumulation', label: 'Накопление объёма у уровня' },
    { key: 'proboy_volume_growth', label: 'Объём растёт при приближении' },
    { key: 'proboy_trend', label: 'Тренд совпадает с направлением' },
    { key: 'proboy_level_tested', label: 'Уровень протестирован 2+ раза' },
    { key: 'proboy_low_pass_road', label: 'Пройдено < 60% ATR (запас хода)' },
  ],
  МИНУСЫ: [
    { key: 'proboy_sawing', label: 'Запил (пила) на уровне' },
    { key: 'proboy_weak_volume', label: 'Слабый объём у уровня' },
    { key: 'proboy_counter_trend', label: 'Контртренд на старшем ТФ' },
    { key: 'proboy_wide_atr', label: 'Расширенный ATR (высокая волатильность)' },
    { key: 'proboy_news_against', label: 'Новостной фон против сетапа' },
    { key: 'proboy_btc_opposite', label: 'BTC движется в противоположную сторону' },
  ],
  ОЖИДАЮ: [
    { key: 'proboy_wait_close_above', label: 'Закрытие свечи выше уровня' },
    { key: 'proboy_wait_retest', label: 'Ретест уровня снизу' },
    { key: 'proboy_wait_volume_confirm', label: 'Подтверждение объёма на пробое' },
    { key: 'proboy_wait_pullback', label: 'Откат для входа по лучшей цене' },
  ],
};
