import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';
import { retry } from '../utils/retry';
import type { MarketType, Direction, Strategy } from '../types/deal';
import type { CalculationResult, ClaudeCheckResult, ClaudeStatsResult } from '../types/calculation';
import type { ChecklistSnapshot } from '../types/deal';
import type { Deal } from '../types/deal';

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
