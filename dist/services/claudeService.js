"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkSetup = checkSetup;
exports.analyzeClosedDeal = analyzeClosedDeal;
exports.generateAnalysisReport = generateAnalysisReport;
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const config_1 = require("../config");
const retry_1 = require("../utils/retry");
const client = new sdk_1.default({ apiKey: config_1.config.anthropic.apiKey });
const CHECK_SETUP_SYSTEM = `You are a trading assistant. Analyze the setup against strategy rules.
Strategies: Breakout, False Breakout, Bounce.

Breakout rules:
- Entry is valid if passRoad < 60% ATR
- Squeeze to the level on small bars = plus
- Sawing (chop) at the level = minus
- Bitcoin moving the opposite way = warning

False Breakout rules:
- Long uninterrupted move to the level = key signal
- V-approach = plus
- No accumulation = minus

Respond strictly in JSON:
{
  "recommendation": "take" | "skip" | "wait",
  "confidence": 0-100,
  "reasoning": "brief explanation in English",
  "reasoning_ru": "краткое объяснение на русском",
  "warnings": ["warning in English"],
  "warnings_ru": ["предупреждение на русском"]
}`;
const ANALYZE_DEAL_SYSTEM = `You are a trading mentor. Analyze a closed trade and give feedback.
Focus on: entry quality, checklist compliance, outcome.
Find mistakes and concrete improvements.

Respond strictly in JSON:
{
  "summary": "brief trade summary in English",
  "summary_ru": "краткое резюме на русском",
  "mistakes": ["mistake in English"],
  "mistakes_ru": ["ошибка на русском"],
  "improvements": ["improvement in English"],
  "improvements_ru": ["улучшение на русском"]
}`;
async function callClaude(system, userMessage) {
    return (0, retry_1.retry)(async () => {
        const response = await client.messages.create({
            model: config_1.config.anthropic.model,
            max_tokens: 1024,
            system,
            messages: [{ role: 'user', content: userMessage }],
        });
        const content = response.content[0];
        if (!content || content.type !== 'text') {
            throw new Error('Unexpected Claude response format');
        }
        return content.text;
    });
}
async function callClaudeWithImage(system, text, imageUrl) {
    return (0, retry_1.retry)(async () => {
        const content = imageUrl
            ? [
                { type: 'image', source: { type: 'url', url: imageUrl } },
                { type: 'text', text },
            ]
            : text;
        const response = await client.messages.create({
            model: config_1.config.anthropic.model,
            max_tokens: 1024,
            system,
            messages: [{ role: 'user', content }],
        });
        const block = response.content[0];
        if (!block || block.type !== 'text')
            throw new Error('Unexpected Claude response');
        return block.text;
    });
}
function extractJson(text) {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match || !match[0])
        throw new Error('No JSON found in Claude response');
    return JSON.parse(match[0]);
}
function strategyToEnglish(strategy) {
    const map = {
        'Пробой': 'Breakout',
        'Ложный Пробой': 'False Breakout',
        'Отбой': 'Bounce',
    };
    return map[strategy];
}
function formatChecklistKeys(keys) {
    return keys.length > 0 ? keys.join(', ') : 'none';
}
async function checkSetup(params) {
    const { ticker, marketType, strategy, direction, calcResult, checklist, ohlcvSummary, screenshotUrl } = params;
    const userMessage = `
Ticker: ${ticker} (${marketType})
Strategy: ${strategyToEnglish(strategy)}
Direction: ${direction}
ATR: ${calcResult.atr}
passRoad: ${calcResult.passRoad ?? 'n/a'}%
rangeReserve: ${calcResult.rangeReserve ?? 'n/a'}
entryPrice: ${calcResult.entryPrice}
SL: ${calcResult.stopLossDefault}
TP: ${calcResult.takeProfitDefault}

Checklist (keys):
PLUS: ${formatChecklistKeys(checklist.plus)}
MINUS: ${formatChecklistKeys(checklist.minus)}
WAIT: ${formatChecklistKeys(checklist.wait)}

Last 10 OHLCV bars:
${ohlcvSummary}
`.trim();
    const text = await callClaudeWithImage(CHECK_SETUP_SYSTEM, userMessage, screenshotUrl);
    const parsed = extractJson(text);
    return {
        recommendation: parsed.recommendation,
        confidence: parsed.confidence,
        reasoning: parsed.reasoning,
        reasoningRu: parsed.reasoning_ru,
        warnings: parsed.warnings ?? [],
        warningsRu: parsed.warnings_ru,
        checkedAt: new Date(),
    };
}
async function analyzeClosedDeal(deal) {
    const userMessage = `
Сделка #${deal.id}
Тикер: ${deal.ticker} (${deal.marketType})
Стратегия: ${deal.strategy}
Направление: ${deal.direction}
Уровень: ${deal.entryRaw}
ATR: ${deal.calcResult.atr}
passRoad: ${deal.calcResult.passRoad ?? 'н/д'}%
Вход: ${deal.calcResult.entryPrice}
SL: ${deal.calcResult.stopLossDefault}
TP: ${deal.calcResult.takeProfitDefault}
Результат: ${deal.dealResult ?? 'неизвестен'}
Цена закрытия: ${deal.closePrice ?? 'н/д'}
${deal.checklistSnapshot ? `
Чек-лист:
ПРЕДПОСЫЛКИ: ${deal.checklistSnapshot.plus.join(', ') || 'нет'}
МИНУСЫ: ${deal.checklistSnapshot.minus.join(', ') || 'нет'}
ОЖИДАЮ: ${deal.checklistSnapshot.wait.join(', ') || 'нет'}
` : ''}
${deal.claudeCheckResult ? `Рекомендация Claude при входе: ${deal.claudeCheckResult.recommendation} (${deal.claudeCheckResult.confidence}%)` : ''}
`.trim();
    const content = [];
    if (deal.screenshotSetup) {
        content.push({ type: 'text', text: 'Скриншот сетапа:' });
        content.push({ type: 'image', source: { type: 'url', url: deal.screenshotSetup } });
    }
    if (deal.screenshotEntry) {
        content.push({ type: 'text', text: 'Скриншот входа:' });
        content.push({ type: 'image', source: { type: 'url', url: deal.screenshotEntry } });
    }
    if (deal.screenshotClose) {
        content.push({ type: 'text', text: 'Скриншот закрытия:' });
        content.push({ type: 'image', source: { type: 'url', url: deal.screenshotClose } });
    }
    content.push({ type: 'text', text: userMessage });
    const text = await (0, retry_1.retry)(async () => {
        const response = await client.messages.create({
            model: config_1.config.anthropic.model,
            max_tokens: 1024,
            system: ANALYZE_DEAL_SYSTEM,
            messages: [{ role: 'user', content }],
        });
        const block = response.content[0];
        if (!block || block.type !== 'text')
            throw new Error('Unexpected Claude response');
        return block.text;
    });
    const parsed = extractJson(text);
    return {
        summary: parsed.summary,
        mistakes: parsed.mistakes ?? [],
        improvements: parsed.improvements ?? [],
        analyzedAt: new Date(),
    };
}
async function generateAnalysisReport(params) {
    const { periodFrom, periodTo, metrics } = params;
    const systemPrompt = `Ты — персональный торговый аналитик трейдера.
Анализируешь статистику сделок за период и генерируешь детальный отчёт.
Отвечай строго в JSON формате:
{
  "summary": "краткое резюме 2-3 предложения",
  "contentHtml": "полный HTML отчёт"
}

HTML отчёт должен:
- Использовать встроенные стили (inline CSS)
- Тёмная тема: фон #1a1a1a, текст #e0e0e0
- Включать секции: Общая оценка, Анализ по стратегиям, PassRoad анализ,
  ATR% режимы, Чек-лист инсайты, День недели, Психология (серии),
  Ratio анализ, Время до входа, Конкретные рекомендации
- Зелёный цвет #4caf50 для хороших показателей
- Красный #f44336 для плохих
- Оранжевый #ff9800 для средних
- Таблицы с border-collapse, padding 8px
- H2 заголовки секций с border-bottom
- Конкретные правила в конце: "Не входи если passRoad > X%", "Лучший день: Y"`;
    const userMessage = `Период: ${periodFrom} — ${periodTo}
Всего сделок: ${metrics.totalDeals}
Закрытых: ${metrics.closedDeals}
Win Rate: ${metrics.winRate}%
Лучшая стратегия: ${metrics.bestStrategy}
Худшая стратегия: ${metrics.worstStrategy}
Главная ошибка: ${metrics.topMistake}

PassRoad зоны:
${JSON.stringify(metrics.winRateByPassRoad, null, 2)}

По стратегиям:
${JSON.stringify(metrics.winRateByStrategy, null, 2)}

ATR% режимы:
${JSON.stringify(metrics.winRateByAtrPercent, null, 2)}

Чек-лист корреляция (топ пункты):
${JSON.stringify(metrics.checklistCorrelation, null, 2)}

День недели:
${JSON.stringify(metrics.winRateByDayOfWeek, null, 2)}

Серии:
${JSON.stringify(metrics.streakAnalysis, null, 2)}

Ratio (план vs реальность):
${JSON.stringify(metrics.ratioAnalysis, null, 2)}

Время до входа:
${JSON.stringify(metrics.timeToEntryAnalysis, null, 2)}

Сгенерируй детальный HTML отчёт с анализом и конкретными рекомендациями.`;
    const text = await (0, retry_1.retry)(async () => {
        const response = await client.messages.create({
            model: config_1.config.anthropic.model,
            max_tokens: 4096,
            system: systemPrompt,
            messages: [{ role: 'user', content: userMessage }],
        });
        const block = response.content[0];
        if (!block || block.type !== 'text')
            throw new Error('Unexpected Claude response format');
        return block.text;
    });
    const clean = text.replace(/```json|```/g, '').trim();
    let parsed;
    try {
        parsed = JSON.parse(clean);
    }
    catch {
        const start = clean.indexOf('{');
        const end = clean.lastIndexOf('}');
        if (start !== -1 && end !== -1) {
            parsed = JSON.parse(clean.slice(start, end + 1));
        }
        else {
            throw new Error('Claude returned invalid JSON for analysis report');
        }
    }
    return {
        summary: parsed.summary ?? '',
        contentHtml: parsed.contentHtml ?? '',
    };
}
//# sourceMappingURL=claudeService.js.map