# EdgeMark — статус по факту кода (не правки старого roadmap)

> Отдельный документ для сравнения с `EDGEMARK_ROADMAP.md` / PDF.
> Статусы: **done** · **optimal-alt** (цель достигнута иначе, чем в старом плане) · **partial** · **todo**
> Обновлять после заметных мержей. Админ пользуется тем же пайплайном, что пользователь (`currentUser.id`).

**Сверка:** Backend / Frontend / Extension · Oct 2026

---

## Легенда «optimal-alt»

| Старый план | Факт | Почему так |
|-------------|------|------------|
| LiteLLM proxy | `askClaude('fast'\|'smart')` + Anthropic SDK | Один провайдер; $0 infra |
| Redis + BullMQ | Postgres `claude_jobs` + SKIP LOCKED | Redis на Railway не было; PG хватает на валидацию |
| DXY в market context | UUP (ETF) | Free Polygon/TwelveData не отдают DXY |
| Guardrails AI (Python) | TS `inputGuardrails` | $0, без второго сервиса |
| OpenAI/Voyage embeddings | Structured 64-d + pgvector | $0 API; семантика — позже при ключе |
| LangFuse | *(в работе: свой `ai_usage_logs` в PG)* | $0, свои данные |

---

## Фаза 0 — As-is продукт

| Пункт | Статус | Где |
|-------|--------|-----|
| Extension popup + screenshot | done | Extension |
| Fastify API, calc ATR ZY / passRoad | done | `deals/`, `calculationService` |
| checkSetup / analyzeClosedDeal | done | `ai/claudeService` (уже не opus-only) |
| Telegram notify | done | `telegram/` |
| PG deals / checklists / comments | done | migrations |
| R2 screenshots | done | `storage/` |
| Dashboard Deals / Checklists / Analysis | done | Frontend |
| ЖЦ сделки + missed | done | deals + reminders |
| checkDuplicate 30s | done | dealService |
| streakAnalysis в metrics | done | dealMetrics |

---

## Фаза 1 — Фундамент

| Пункт | Статус | Заметки |
|-------|--------|---------|
| Модульный монолит TS | done | `modules/*` |
| payments модуль | todo | Фаза запуска |
| zod на весь конфиг при старте | partial | zod в handlers; конфиг — env/conf |
| Auth + user_id + guard | done | invite, JWT/refresh, api tokens |
| Extension / TG привязка к user | done | |
| Checklist `description` | done | migration 013 + UI |
| `AiProvider` граница | done | `ai/aiProvider.ts` → worker |

---

## Фаза 2 — Экономия AI

| Пункт | Статус | Заметки |
|-------|--------|---------|
| Роутинг Haiku / Sonnet | **optimal-alt** | без LiteLLM |
| Fallback модели | todo | |
| Prompt caching | done | `cache_control: ephemeral` |
| LangFuse | **optimal-alt** | `ai_usage_logs` в PG ($0), без LangFuse |
| Цифры $ / токены по user | partial | пишется в БД; UI дашборда — later |

---

## Фаза 3 — Очередь

| Пункт | Статус | Заметки |
|-------|--------|---------|
| Асинхронные Claude-вызовы | **optimal-alt** | PG queue, не Redis |
| Worker отдельным процессом | todo | сейчас in-process |
| UI «готовится» | partial | Analysis poll; createNote `claudePending` |
| Retry / failed + Telegram fallback | done | check_setup |
| Идемпотентность enqueue | partial | dedupe pending/running по deal |

---

## Фаза 4 — Данные и интеллект

| Пункт | Статус | Заметки |
|-------|--------|---------|
| RAG pgvector + user_id | **optimal-alt** | structured-v1, migration 016 |
| Market context BTC/SPY/USD | **optimal-alt** | UUP вместо DXY, cache 15m |
| Evaluation take/skip + dashboard | done | accuracy + ECE + calibration curve chart |
| Reminders / auto-missed | done | Railway Cron + `/api/internal/reminders` |

---

## Фаза 5 — Агентный / SaaS safety

| Пункт | Статус | Заметки |
|-------|--------|---------|
| Guardrails на free-text | **optimal-alt** | comments + checklist label/description |
| MCP server | todo | |
| LangGraph agent | todo | после guardrails+RAG |

---

## Фаза 6 — Extension overlay

| Пункт | Статус | Заметки |
|-------|--------|---------|
| Линии Entry/SL/TP на скрине | **optimal-alt** | `chartOverlay` + geometry, не классический content_scripts |
| Fallback если геометрию не нашли | partial | warning в popup |

---

## Фаза 7–8 — Запуск и scale

| Пункт | Статус |
|-------|--------|
| Kaspi / Halyk / тарифы / квоты | todo |
| Rate limit / hard caps | done | daily AI quotas + burst/min; same for admin/user |
| Ребренд ZY → EdgeMark, лендинг, домен | todo |
| k6, PgBouncer, multi-instance, алерты | todo |
| Отдельный worker для scale-out | todo |

---

## Фаза 9 — Идеи

| Пункт | Статус |
|-------|--------|
| Losing-streak warning в checkSetup | done (раньше, чем «идея») |
| AI-заполнение чеклиста | todo |
| Portfolio risk | todo |
| Backtesting / skip-симуляция | todo (отдельный backlog) |
| Telegram фото+цифры как основной ввод | partial (текст есть) |

---

## Динамические настройки трейдера

| Пункт | Статус | Заметки |
|-------|--------|---------|
| Templates → fork на user create | done | `risk_preset_templates` / `strategy_templates`, migration 018 |
| Risk presets CRUD + archive | done | market-agnostic поля; system нельзя archive |
| Strategies CRUD + archive | done | system нельзя rename/archive; open deals ок |
| resolveRisk в createNote / preview / bot | done | |
| Frontend «Риск и стратегии» | done | `/settings/trading` |
| Extension silent refresh | done | strategies + presets + checklists |

---

## Следующий слой

1. ~~AI usage / worker / cost UI / quotas / calibration~~ → done  
2. ~~Динамические strategies / risk presets~~ → done  
3. Платежи (Kaspi/Halyk) + тарифы  
4. Ребренд / лендинг / домен  
5. LangGraph + MCP (после оплаты)  

---

## Как сравнивать со старым roadmap

1. Открыть `EDGEMARK_ROADMAP.md` (или PDF) рядом с этим файлом.  
2. Смотреть колонку **Статус**: `optimal-alt` = не баг, осознанное упрощение.  
3. `todo` / `partial` — реальный долг к публичному SaaS.
