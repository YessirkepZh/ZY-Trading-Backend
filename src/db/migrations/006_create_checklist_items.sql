CREATE TABLE IF NOT EXISTS checklist_items (
  id         SERIAL PRIMARY KEY,
  strategy   VARCHAR(30)  NOT NULL,
  item_type  VARCHAR(12)  NOT NULL CHECK (item_type IN ('plus', 'minus', 'wait')),
  key        VARCHAR(60)  NOT NULL,
  label      VARCHAR(200) NOT NULL,
  position   INTEGER      NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (strategy, key)
);

CREATE INDEX IF NOT EXISTS idx_checklist_items_strategy ON checklist_items(strategy);

-- Seed: Пробой
INSERT INTO checklist_items (strategy, item_type, key, label, position) VALUES
  ('Пробой', 'plus', 'proboy_squeeze',       'Поджатие к уровню на малых барах',     0),
  ('Пробой', 'plus', 'proboy_accumulation',   'Накопление объёма у уровня',            1),
  ('Пробой', 'plus', 'proboy_volume_growth',  'Объём растёт при приближении',          2),
  ('Пробой', 'plus', 'proboy_trend',          'Тренд совпадает с направлением',        3),
  ('Пробой', 'plus', 'proboy_level_tested',   'Уровень протестирован 2+ раза',         4),
  ('Пробой', 'plus', 'proboy_low_pass_road',  'Пройдено < 60% ATR (запас хода)',       5),

  ('Пробой', 'minus', 'proboy_sawing',        'Запил (пила) на уровне',                0),
  ('Пробой', 'minus', 'proboy_weak_volume',   'Слабый объём у уровня',                 1),
  ('Пробой', 'minus', 'proboy_counter_trend', 'Контртренд на старшем ТФ',              2),
  ('Пробой', 'minus', 'proboy_wide_atr',      'Расширенный ATR (высокая волатильность)', 3),
  ('Пробой', 'minus', 'proboy_news_against',  'Новостной фон против сетапа',           4),
  ('Пробой', 'minus', 'proboy_btc_opposite',  'BTC движется в противоположную сторону', 5),

  ('Пробой', 'wait', 'proboy_wait_close_above',    'Закрытие свечи выше уровня',           0),
  ('Пробой', 'wait', 'proboy_wait_retest',          'Ретест уровня снизу',                  1),
  ('Пробой', 'wait', 'proboy_wait_volume_confirm',  'Подтверждение объёма на пробое',       2),
  ('Пробой', 'wait', 'proboy_wait_pullback',        'Откат для входа по лучшей цене',       3)
ON CONFLICT (strategy, key) DO NOTHING;

-- Seed: Ложный Пробой
INSERT INTO checklist_items (strategy, item_type, key, label, position) VALUES
  ('Ложный Пробой', 'plus', 'fp_long_move',           'Длинное безоткатное движение к уровню',  0),
  ('Ложный Пробой', 'plus', 'fp_v_approach',           'V-подход к уровню',                       1),
  ('Ложный Пробой', 'plus', 'fp_overbought',           'Перекупленность / перепроданность',       2),
  ('Ложный Пробой', 'plus', 'fp_key_level',            'Ключевой уровень поддержки / сопротивления', 3),
  ('Ложный Пробой', 'plus', 'fp_fake_breakout_candle', 'Свеча ложного пробоя сформирована',       4),
  ('Ложный Пробой', 'plus', 'fp_volume_spike',         'Всплеск объёма на пробое-фейке',          5),

  ('Ложный Пробой', 'minus', 'fp_no_accumulation', 'Нет накопления перед пробоем',              0),
  ('Ложный Пробой', 'minus', 'fp_weak_impulse',    'Слабый импульс разворота',                  1),
  ('Ложный Пробой', 'minus', 'fp_low_volume',      'Низкий объём при развороте',                2),
  ('Ложный Пробой', 'minus', 'fp_trend_against',   'Сильный тренд против разворота',            3),
  ('Ложный Пробой', 'minus', 'fp_no_structure',    'Структура рынка не подтверждает разворот',  4),

  ('Ложный Пробой', 'wait', 'fp_wait_return_under',    'Возврат цены обратно под уровень',         0),
  ('Ложный Пробой', 'wait', 'fp_wait_close_back',      'Закрытие свечи обратно за уровень',        1),
  ('Ложный Пробой', 'wait', 'fp_wait_reversal_confirm','Подтверждение разворота (поглощение / пин-бар)', 2),
  ('Ложный Пробой', 'wait', 'fp_wait_volume_reversal', 'Рост объёма на откате обратно',            3)
ON CONFLICT (strategy, key) DO NOTHING;

-- Seed: Отбой
INSERT INTO checklist_items (strategy, item_type, key, label, position) VALUES
  ('Отбой', 'plus', 'otboy_touch_level',   'Касание уровня поддержки / сопротивления', 0),
  ('Отбой', 'plus', 'otboy_volume_at_level','Объём при касании уровня',                 1),
  ('Отбой', 'plus', 'otboy_divergence',    'Дивергенция индикатора с ценой',           2),
  ('Отбой', 'plus', 'otboy_structure',     'Структура рынка за разворот от уровня',    3),
  ('Отбой', 'plus', 'otboy_trend_align',   'Тест уровня по тренду',                    4),
  ('Отбой', 'plus', 'otboy_clean_level',   'Чистый уровень без пробоев в прошлом',     5),

  ('Отбой', 'minus', 'otboy_prev_break',   'Уровень уже был пробит ранее',             0),
  ('Отбой', 'minus', 'otboy_no_zone',      'Нет зоны накопления у уровня',             1),
  ('Отбой', 'minus', 'otboy_counter_trend','Движение против основного тренда',         2),
  ('Отбой', 'minus', 'otboy_wide_spread',  'Широкий спред свечей (нестабильность)',    3),
  ('Отбой', 'minus', 'otboy_news_risk',    'Предстоящая новость создаёт риск',         4),

  ('Отбой', 'wait', 'otboy_wait_engulf',        'Свеча поглощения от уровня',              0),
  ('Отбой', 'wait', 'otboy_wait_pin_bar',       'Пин-бар / хаммер у уровня',              1),
  ('Отбой', 'wait', 'otboy_wait_close_at_level','Закрытие свечи у уровня без пробоя',     2),
  ('Отбой', 'wait', 'otboy_wait_retest_mini',   'Мини-ретест после отбоя',                3)
ON CONFLICT (strategy, key) DO NOTHING;
