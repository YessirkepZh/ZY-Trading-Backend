"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkSetup = checkSetup;
exports.analyzeClosedDeal = analyzeClosedDeal;
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const config_1 = require("../config");
const retry_1 = require("../utils/retry");
const client = new sdk_1.default({ apiKey: config_1.config.anthropic.apiKey });
const CHECK_SETUP_SYSTEM = `Ты — ассистент трейдера. Анализируешь торговый сетап по правилам стратегии.
Стратегии: Пробой (breakout), Ложный Пробой (false breakout), Отбой (bounce).

Правила стратегии Пробой:
- Вход актуален если passRoad < 60% ATR
- Поджатие к уровню на малых барах = плюс
- Запил на уровне = минус
- Биткоин в другую сторону = предупреждение

Правила стратегии Ложный Пробой:
- Длинное безоткатное движение к уровню = ключевой признак
- V-подход = плюс
- Нет накопления = минус

Отвечай строго в JSON формате:
{
  "recommendation": "take" | "skip" | "wait",
  "confidence": 0-100,
  "reasoning": "краткое объяснение",
  "warnings": ["предупреждение 1", "предупреждение 2"]
}`;
const ANALYZE_DEAL_SYSTEM = `Ты — ментор трейдера. Анализируешь закрытую сделку и даёшь обратную связь.
Смотри на: качество входа, соблюдение правил чек-листа, результат.
Найди ошибки и конкретные улучшения.

Отвечай строго в JSON:
{
  "summary": "краткое резюме сделки",
  "mistakes": ["ошибка 1", "ошибка 2"],
  "improvements": ["улучшение 1", "улучшение 2"]
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
function extractJson(text) {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match || !match[0])
        throw new Error('No JSON found in Claude response');
    return JSON.parse(match[0]);
}
async function checkSetup(params) {
    const { ticker, marketType, strategy, direction, calcResult, checklist, ohlcvSummary } = params;
    const userMessage = `
Тикер: ${ticker} (${marketType})
Стратегия: ${strategy}
Направление: ${direction}
ATR: ${calcResult.atr}
passRoad: ${calcResult.passRoad ?? 'н/д'}%
rangeReserve: ${calcResult.rangeReserve ?? 'н/д'}
entryPrice: ${calcResult.entryPrice}
SL: ${calcResult.stopLossDefault}
TP: ${calcResult.takeProfitDefault}

Чек-лист:
ПРЕДПОСЫЛКИ: ${checklist.plus.join(', ') || 'нет'}
МИНУСЫ: ${checklist.minus.join(', ') || 'нет'}
ОЖИДАЮ: ${checklist.wait.join(', ') || 'нет'}

Последние 10 баров OHLCV:
${ohlcvSummary}
`.trim();
    const text = await callClaude(CHECK_SETUP_SYSTEM, userMessage);
    const parsed = extractJson(text);
    return {
        recommendation: parsed.recommendation,
        confidence: parsed.confidence,
        reasoning: parsed.reasoning,
        warnings: parsed.warnings ?? [],
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
    const text = await callClaude(ANALYZE_DEAL_SYSTEM, userMessage);
    const parsed = extractJson(text);
    return {
        summary: parsed.summary,
        mistakes: parsed.mistakes ?? [],
        improvements: parsed.improvements ?? [],
        analyzedAt: new Date(),
    };
}
//# sourceMappingURL=claudeService.js.map