import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';
import { retry } from '../utils/retry';
import { getLabelByKey } from '../services/checklistItemService';
import type { MarketType, Direction, Strategy } from '../types/deal';
import type { CalculationResult, ClaudeCheckResult, ClaudeStatsResult } from '../types/calculation';
import type { ChecklistSnapshot } from '../types/deal';
import type { Deal } from '../types/deal';
import type { AnalysisMetrics } from '../types/analysis';

const client = new Anthropic({ apiKey: config.anthropic.apiKey });

const MARKET_CONTEXT: Record<MarketType, string> = {
  crypto:
    '- Bitcoin (BTC) moving the opposite direction = warning for altcoins',
  stocks:
    '- SPY / QQQ moving the opposite direction = warning (broad market correlation)',
  forex:
    '- DXY (US Dollar Index) moving opposite to USD pairs = warning',
};

function buildCheckSetupSystem(marketType: MarketType): string {
  return `You are a trading assistant. Analyze the setup against strategy rules.
Strategies: Breakout (Пробой), False Breakout (Ложный Пробой), Bounce (Отбой).

Key metric — passRoad:
- passRoad = how much % of the daily ATR the current candle body has already traveled from the day open price.
- passRoad < 40%: excellent — plenty of range left, strong setup signal.
- passRoad 40–60%: acceptable — some range remains.
- passRoad > 60%: warning — most of the day's range is consumed, reward/risk is reduced.
- passRoad > 80%: skip — almost no room left for the trade to develop.

Breakout rules:
- Squeeze to the level on small bars = strong plus
- Volume accumulation near the level = plus
- Sawing / chop at the level = minus
${MARKET_CONTEXT[marketType]}

False Breakout rules:
- Long uninterrupted move to the level (no pullbacks) = key signal
- V-approach = plus
- No accumulation before breakout = minus

Bounce rules:
- Clean level without prior breaks = plus
- Divergence on indicator = plus
- Prior break of the level = minus

The checklist items provided are already evaluated by the trader. Weight them heavily.
If the checklist shows strong PLUS signals and passRoad < 60%, lean toward "take".
Only suggest "skip" if there are clear structural problems (passRoad > 80%, multiple MINUS items, no PLUS items).

Respond strictly in JSON:
{
  "recommendation": "take" | "skip" | "wait",
  "confidence": 0-100,
  "reasoning": "brief explanation in English",
  "reasoning_ru": "краткое объяснение на русском",
  "warnings": ["warning in English"],
  "warnings_ru": ["предупреждение на русском"]
}`;
}

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

async function callClaude(system: string, userMessage: string): Promise<string> {
  return retry(async () => {
    const response = await client.messages.create({
      model: config.anthropic.model,
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

async function callClaudeWithImage(
  system: string,
  text: string,
  imageUrl?: string,
): Promise<string> {
  return retry(async () => {
    const content: Anthropic.MessageParam['content'] = imageUrl
      ? [
          { type: 'image', source: { type: 'url', url: imageUrl } },
          { type: 'text', text },
        ]
      : text;

    const response = await client.messages.create({
      model: config.anthropic.model,
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content }],
    });

    const block = response.content[0];
    if (!block || block.type !== 'text') throw new Error('Unexpected Claude response');
    return block.text;
  });
}

function extractJson(text: string): unknown {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match || !match[0]) throw new Error('No JSON found in Claude response');
  return JSON.parse(match[0]);
}

function strategyToEnglish(strategy: Strategy): string {
  const map: Record<Strategy, string> = {
    'Пробой': 'Breakout',
    'Ложный Пробой': 'False Breakout',
    'Отбой': 'Bounce',
  };
  return map[strategy];
}

function formatChecklistLabels(strategy: Strategy, keys: string[]): string {
  if (keys.length === 0) return 'none';
  return keys.map((k) => getLabelByKey(strategy, k)).join('; ');
}

export async function checkSetup(params: {
  ticker: string;
  marketType: MarketType;
  strategy: Strategy;
  direction: Direction;
  calcResult: CalculationResult;
  checklist: ChecklistSnapshot;
  ohlcvSummary: string;
  screenshotUrl?: string;
}): Promise<ClaudeCheckResult> {
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

Checklist (trader evaluation):
PLUS: ${formatChecklistLabels(strategy, checklist.plus)}
MINUS: ${formatChecklistLabels(strategy, checklist.minus)}
WAIT: ${formatChecklistLabels(strategy, checklist.wait)}

Last 10 OHLCV bars:
${ohlcvSummary}
`.trim();

  const text = await callClaudeWithImage(buildCheckSetupSystem(marketType), userMessage, screenshotUrl);
  const parsed = extractJson(text) as {
    recommendation: 'take' | 'skip' | 'wait';
    confidence: number;
    reasoning: string;
    reasoning_ru?: string;
    warnings: string[];
    warnings_ru?: string[];
  };

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

export async function analyzeClosedDeal(deal: Deal): Promise<ClaudeStatsResult> {
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

  const content: Anthropic.MessageParam['content'] = [];

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

  const text = await retry(async () => {
    const response = await client.messages.create({
      model: config.anthropic.model,
      max_tokens: 1024,
      system: ANALYZE_DEAL_SYSTEM,
      messages: [{ role: 'user', content }],
    });

    const block = response.content[0];
    if (!block || block.type !== 'text') throw new Error('Unexpected Claude response');
    return block.text;
  });

  const parsed = extractJson(text) as {
    summary: string;
    mistakes: string[];
    improvements: string[];
  };

  return {
    summary: parsed.summary,
    mistakes: parsed.mistakes ?? [],
    improvements: parsed.improvements ?? [],
    analyzedAt: new Date(),
  };
}

export async function generateAnalysisReport(params: {
  periodFrom: string;
  periodTo: string;
  metrics: AnalysisMetrics;
}): Promise<{ summary: string; contentHtml: string }> {
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

  const text = await retry(async () => {
    const response = await client.messages.create({
      model: config.anthropic.model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }],
    });
    const block = response.content[0];
    if (!block || block.type !== 'text') throw new Error('Unexpected Claude response format');
    return block.text;
  });

  const clean = text.replace(/```json|```/g, '').trim();

  let parsed: { summary?: string; contentHtml?: string };
  try {
    parsed = JSON.parse(clean) as typeof parsed;
  } catch {
    const start = clean.indexOf('{');
    const end   = clean.lastIndexOf('}');
    if (start !== -1 && end !== -1) {
      parsed = JSON.parse(clean.slice(start, end + 1)) as typeof parsed;
    } else {
      throw new Error('Claude returned invalid JSON for analysis report');
    }
  }

  return {
    summary:     parsed.summary     ?? '',
    contentHtml: parsed.contentHtml ?? '',
  };
}
