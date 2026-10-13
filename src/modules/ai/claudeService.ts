import Anthropic from '@anthropic-ai/sdk';
import { config } from '../../config';
import { retry } from '../../shared/retry';
import type { ChecklistSnapshot, Direction, MarketType, Strategy } from '../../shared/trading';
import type { AnalysisMetrics } from '../analytics';
import { getLabelByKey } from '../checklists';
import type { CalculationResult, Deal } from '../deals';
import type { ChartPane, ClaudeCheckResult, ClaudeStatsResult } from './types';

const client = new Anthropic({ apiKey: config.anthropic.apiKey });

const MARKET_CONTEXT: Record<MarketType, string> = {
  crypto:
    '- Bitcoin (BTC) moving the opposite direction = warning for altcoins',
  stocks:
    '- SPY / QQQ moving the opposite direction = warning (broad market correlation)',
  forex:
    '- DXY (US Dollar Index) moving opposite to USD pairs = warning',
};

const PASS_ROAD_RULES = `
## Правила passRoad по стратегиям

### Пробой и Отбой:
- passRoad < 50% — отлично, полный потенциал
- passRoad 50-70% — допустимо, предупреди трейдера
- passRoad > 70% — критично, снижай рекомендацию
- passRoad > 80% — рекомендуй пропустить по этому критерию

### Ложный Пробой (ВАЖНО — другая логика!):
- passRoad высокий (50-200%) — это НОРМАЛЬНО и является
  ПРИЗНАКОМ сетапа. Энергия импульса исчерпана — это хорошо.
  НЕ снижай рекомендацию из-за высокого passRoad при ЛП.
- passRoad 200-400% — допустимо для волатильных инструментов
  (крипто мемкоины с ATR% > 5%)
- passRoad > 400% — предупреди но не делай это главным критерием
- passRoad > 500% — тогда снижай рекомендацию

### Для Ложного Пробоя фокусируйся на:
1. Есть ли подтверждение возврата? (fp-close-back, fp-fast-return)
2. Есть ли запас хода для TP в обратном направлении?
3. Каково качество уровня? (touches, реакция)
4. Есть ли сильный импульс на пробое (fp-strong-impulse) — это минус
5. Рынок/индекс против направления пробоя?

НЕ применяй правило passRoad < 50% к стратегии Ложный Пробой.
`;

function buildCheckSetupSystem(marketType: MarketType): string {
  return `${PASS_ROAD_RULES}
You are a trading assistant. Analyze the setup against strategy rules.
Strategies: Breakout (Пробой), False Breakout (Ложный Пробой), Bounce (Отбой).

passRoad = how much % of the daily ATR the current candle body has already traveled from the day open price.
Apply passRoad rules per strategy above — False Breakout uses different thresholds.

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
For Breakout/Bounce: lean toward "take" when checklist PLUS is strong and passRoad < 70%.
For False Breakout: do NOT penalize high passRoad — focus on return confirmation and setup quality.
Only suggest "skip" if there are clear structural problems per strategy passRoad rules, multiple MINUS items, or no PLUS items.

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

const ANALYZE_DEAL_SYSTEM = `You are a trading mentor. Analyze a closed trade and give feedback in Russian.
Focus on: entry quality, checklist compliance, outcome.
Find mistakes and concrete improvements.

Respond strictly in JSON:
{
  "summary_ru": "краткое резюме сделки на русском",
  "mistakes_ru": ["ошибка на русском"],
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

interface CaptionedImage {
  caption: string;
  url: string;
}

async function callClaudeWithImages(
  system: string,
  text: string,
  images: CaptionedImage[],
): Promise<string> {
  return retry(async () => {
    const content: Anthropic.MessageParam['content'] = images.length > 0
      ? [
          ...images.flatMap((image): Anthropic.ContentBlockParam[] => [
            { type: 'text', text: image.caption },
            { type: 'image', source: { type: 'url', url: image.url } },
          ]),
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

/** TradingView resolution → human timeframe: "5" → "5m", "240" → "4h", "1D" stays */
function formatInterval(interval: string): string {
  if (!/^\d+$/.test(interval)) return interval;
  const minutes = Number(interval);
  return minutes % 60 === 0 ? `${minutes / 60}h` : `${minutes}m`;
}

function describeChartPanes(panes: ChartPane[]): string {
  const list = panes
    .map((p) => {
      const marks = [p.entry && 'entry timeframe', p.annotated && 'levels drawn'].filter(Boolean);
      return `${formatInterval(p.interval)} ${p.symbol}${marks.length ? ` (${marks.join(', ')})` : ''}`;
    })
    .join('; ');
  return `Screenshot layout, timeframes: ${list}.
Lines were drawn by the extension from the numbers below, not by the trader:
gray dashed = level, blue = entry, red = SL, green = TP; shaded zones on the entry timeframe = risk (red) and reward (green).
Price levels are identical on every timeframe — use higher timeframes for structure, the entry timeframe for the trigger.`;
}

function formatStopPlan(calcResult: CalculationResult): string {
  if (calcResult.stopLossByStop === undefined) return '';
  const takes = [calcResult.takeProfitByStop, calcResult.takeProfitByStop2, calcResult.takeProfitByStop3]
    .filter((v): v is number => v !== undefined)
    .join(' / ');
  return `\nTrader's own stop plan (this is what is drawn on the chart and what the trader executes):
entry: ${calcResult.entryPriceByStop}, SL: ${calcResult.stopLossByStop}, TP: ${takes}`;
}

function formatChecklistLabels(userId: number, strategy: Strategy, keys: string[]): string {
  if (keys.length === 0) return 'none';
  return keys.map((k) => getLabelByKey(userId, strategy, k)).join('; ');
}

export async function checkSetup(params: {
  userId: number;
  ticker: string;
  marketType: MarketType;
  strategy: Strategy;
  direction: Direction;
  entryRaw: number;
  calcResult: CalculationResult;
  checklist: ChecklistSnapshot;
  ohlcvSummary: string;
  screenshotUrl?: string;
  /** Close-up of the entry timeframe pane */
  focusScreenshotUrl?: string;
  /** Present only when the extension drew the levels on the screenshot */
  chartPanes?: ChartPane[];
}): Promise<ClaudeCheckResult> {
  const {
    userId, ticker, marketType, strategy, direction, entryRaw, calcResult, checklist, ohlcvSummary,
    screenshotUrl, focusScreenshotUrl, chartPanes,
  } = params;

  const volatilityContext = calcResult.atrPercent != null
    ? calcResult.atrPercent > 5
      ? 'ВЫСОКОВОЛАТИЛЬНЫЙ инструмент (ATR% > 5% — мемкоин/альткоин малой капы). Стандартные пороги passRoad неприменимы.'
      : calcResult.atrPercent > 3
        ? 'Волатильный инструмент (ATR% 3-5%). Пороги passRoad умеренно расширены.'
        : 'Нормальная волатильность (ATR% < 3%). Стандартные пороги.'
    : 'Волатильность неизвестна.';

  const userMessage = `
Ticker: ${ticker} (${marketType})
Strategy: ${strategyToEnglish(strategy)}
Direction: ${direction}
Волатильность инструмента: ${volatilityContext}
ATR%: ${calcResult.atrPercent?.toFixed(2) ?? 'неизвестно'}%
ATR: ${calcResult.atr}
passRoad: ${calcResult.passRoad ?? 'n/a'}%
rangeReserve: ${calcResult.rangeReserve ?? 'n/a'}
level: ${entryRaw}
entryPrice: ${calcResult.entryPrice}
SL: ${calcResult.stopLossDefault}
TP: ${calcResult.takeProfitDefault}${formatStopPlan(calcResult)}
${chartPanes?.length ? `\n${describeChartPanes(chartPanes)}\n` : ''}
Checklist (trader evaluation):
PLUS: ${formatChecklistLabels(userId, strategy, checklist.plus)}
MINUS: ${formatChecklistLabels(userId, strategy, checklist.minus)}
WAIT: ${formatChecklistLabels(userId, strategy, checklist.wait)}

Last 10 OHLCV bars:
${ohlcvSummary}
`.trim();

  const images: CaptionedImage[] = [];
  if (screenshotUrl) images.push({ caption: 'Setup screenshot (full TradingView layout):', url: screenshotUrl });
  if (focusScreenshotUrl) images.push({ caption: 'Close-up of the entry timeframe:', url: focusScreenshotUrl });

  const text = await callClaudeWithImages(buildCheckSetupSystem(marketType), userMessage, images);
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
  if (deal.screenshotFocus) {
    content.push({ type: 'text', text: 'Крупный план ТФ входа при сетапе:' });
    content.push({ type: 'image', source: { type: 'url', url: deal.screenshotFocus } });
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
    summary?: string;
    summary_ru?: string;
    mistakes?: string[];
    mistakes_ru?: string[];
    improvements?: string[];
    improvements_ru?: string[];
  };

  const summaryRu = parsed.summary_ru ?? parsed.summary ?? '';
  const mistakesRu = parsed.mistakes_ru ?? parsed.mistakes ?? [];
  const improvementsRu = parsed.improvements_ru ?? parsed.improvements ?? [];

  return {
    summary: summaryRu,
    summaryRu,
    mistakes: mistakesRu,
    mistakesRu,
    improvements: improvementsRu,
    improvementsRu,
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
