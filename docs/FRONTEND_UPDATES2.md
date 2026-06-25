# Frontend: Dashboard метрики (v2)

Дополнение к `FRONTEND_UPDATES.md`.  
Endpoint: `GET /api/dashboard` → `stats`.

---

## Breaking change

**Все метрики считаются только по закрытым сделкам:**

```
status = 'closed' AND closed_at IS NOT NULL
```

Раньше часть метрик шла от `has_deal = true`. Теперь единый фильтр — закрытые.

`breakeven` **не входит** в winrate.  
R и P&L — из `close_price` + `calc_result` + `payload.riskSum`.

---

## Новые поля верхнего уровня

| Поле | Тип | Описание |
|------|-----|----------|
| `expectancyR` | `number` | `avgWinR × winRate − avgLossR × lossRate` |
| `expectancyUsd` | `number` | expectancy в $ |
| `maxDrawdownR` | `number` | макс. просадка equity curve (R), ≤ 0 |
| `maxDrawdownUsd` | `number` | макс. просадка ($), ≤ 0 |
| `avgDealsPerDay` | `number` | закрытых / дней с ≥1 сделкой |

`totalDeals`, `winRate`, `avgPassRoad` — остались, но считаются по закрытым (winrate без breakeven).

---

## Изменения существующих блоков

### `byMarket`

Структура та же. Winrate: `wins / (wins + losses)`, breakeven исключён.

### `byStrategy` — расширен

```json
{
  "Пробой": {
    "total": 20,
    "wins": 12,
    "losses": 7,
    "winRate": 63,
    "avgRatio": 3,
    "avgR": 0.7,
    "edgePlanned": 1.52,
    "edgeReal": 0.7
  }
}
```

| Поле | Формула |
|------|---------|
| `avgRatio` | средний `payload.ratio` |
| `avgR` | средний фактический R |
| `edgePlanned` | `WR × avgRatio − (1 − WR)` |
| `edgeReal` | = `avgR` |

---

## Новые массивы

### `weeklyPerformance` — график winrate + avgR

Весь период, группировка по ISO-неделям.

```json
[
  {
    "period": "2026-W12",
    "weekStart": "2026-03-16",
    "total": 5,
    "wins": 3,
    "losses": 1,
    "winRate": 75,
    "avgR": 0.8
  }
]
```

- `period` — `YYYY-Www`
- `winRate` / `avgR` = `null` если `total < 3`
- только недели с ≥1 сделкой

### `dealsPerDay`

```json
[{ "date": "2026-03-16", "count": 3 }]
```

### `profitSumDaily`

```json
[{ "date": "2026-03-16", "profitR": 1.2, "profitUsd": 18 }]
```

`profitUsd` может быть отрицательным.

### `dailyDrawdown`

```json
[{ "date": "2026-03-16", "drawdownR": -0.5, "drawdownUsd": -7.5 }]
```

Просадка от running peak на конец дня, ≤ 0.

### `topChecklistInWins`

Сортировка `inWins DESC`, min 3 сделки на пункт, top 10.

### `topChecklistInLoss`

Сортировка `inLosses DESC`, min 3 сделки на пункт, top 10.

```json
[
  {
    "key": "squeeze",
    "label": "Сжатие у уровня",
    "type": "plus",
    "strategy": "Пробой",
    "inWins": 15,
    "inLosses": 4,
    "total": 22
  }
]
```

---

## Без изменений

`recentDeals` — последние 10 сделок (все статусы).

---

## UI

| Блок | Данные |
|------|--------|
| KPI-карточки | `expectancyR`, `expectancyUsd`, `maxDrawdownR`, `maxDrawdownUsd`, `avgDealsPerDay` |
| Dual-axis chart | `weeklyPerformance` — winrate + avgR |
| Bar / line charts | `profitSumDaily`, `dailyDrawdown`, `dealsPerDay` |
| Таблица стратегий | `byStrategy` + `edgePlanned`, `edgeReal` |
| Checklist топы | `topChecklistInWins`, `topChecklistInLoss` |
