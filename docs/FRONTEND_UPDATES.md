# Frontend: API изменения

## 1. Dashboard — `GET /api/dashboard`

Новое поле `stats.byMarket`:

```json
{
  "byMarket": {
    "stocks": { "total": 10, "wins": 6, "losses": 3, "winRate": 60 },
    "crypto": { "total": 5, "wins": 2, "losses": 2, "winRate": 40 },
    "forex":  { "total": 8, "wins": 4, "losses": 3, "winRate": 50 }
  }
}
```

- `total` — сделки с `hasDeal = true`
- `wins` / `losses` — по `dealResult`
- `winRate` — `wins / total * 100`, округление до целого
- Ключи: `stocks`, `crypto`, `forex`

---

## 2. Детали сделки — `GET /api/deals/:id`

Ответ расширен полем `comments`:

```json
{
  "success": true,
  "deal": { ... },
  "comments": [
    { "id": 1, "dealId": 42, "text": "...", "createdAt": "2026-06-25T12:00:00.000Z" }
  ]
}
```

### Claude-анализ после закрытия (`deal.claudeStatsResult`)

Использовать русские поля:

| Поле | Тип |
|------|-----|
| `summaryRu` | `string` |
| `mistakesRu` | `string[]` |
| `improvementsRu` | `string[]` |
| `analyzedAt` | `Date` |

Fallback для старых сделок: `summary`, `mistakes`, `improvements` (могут быть на EN).

---

## 3. Добавить комментарий — `POST /api/deals/:id/comments`

**Body:**
```json
{ "text": "текст комментария" }
```

- `text`: 1–2000 символов

**201:**
```json
{
  "success": true,
  "comment": { "id": 1, "dealId": 42, "text": "...", "createdAt": "..." }
}
```

**400** — невалидный id / body  
**404** — сделка не найдена

---

## UI

| Экран | Действие |
|-------|----------|
| Dashboard | Блок win/loss/winRate по stocks, crypto, forex |
| Детали сделки | Секция комментариев (список + форма добавления) |
| Детали сделки | Claude post-close анализ на русском (`*Ru` поля) |
