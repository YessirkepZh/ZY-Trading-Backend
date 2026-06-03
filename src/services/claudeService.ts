import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';
import { retry } from '../utils/retry';
import type { MarketType, Direction, Strategy } from '../types/deal';
import type { CalculationResult, ClaudeCheckResult, ClaudeStatsResult } from '../types/calculation';
import type { ChecklistSnapshot } from '../types/deal';
import type { Deal } from '../types/deal';
import type { AnalysisMetrics } from '../types/analysis';

const client = new Anthropic({ apiKey: config.anthropic.apiKey });

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

  const text = await callClaudeWithImage(CHECK_SETUP_SYSTEM, userMessage, screenshotUrl);
  const parsed = extractJson(text) as {
    recommendation: 'take' | 'skip' | 'wait';
    confidence: number;
    reasoning: string;
    warnings: string[];
  };

  return {
    recommendation: parsed.recommendation,
    confidence: parsed.confidence,
    reasoning: parsed.reasoning,
    warnings: parsed.warnings ?? [],
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
