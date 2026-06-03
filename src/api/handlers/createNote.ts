import type { FastifyRequest, FastifyReply } from 'fastify';
import { CreateNoteSchema } from '../../utils/validators';
import * as marketDataService from '../../services/marketDataService';
import * as calculationService from '../../services/calculationService';
import * as claudeService from '../../services/claudeService';
import * as dealService from '../../services/dealService';
import * as storageService from '../../services/storageService';
import * as telegramService from '../../services/telegramService';
import { getDealActionKeyboard } from '../../bot/keyboards';

export async function createNoteHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const parsed = CreateNoteSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.status(400).send({ success: false, error: parsed.error.flatten() });
      return;
    }

    const input = parsed.data;
    const {
      ticker, marketType, strategy, direction,
      entryRaw, customStop, riskPercent, ratio, luftPercent, riskSum, checklist, screenshot,
      atrOverride, passRoadOverride,
    } = input;

    // Deduplication check
    const isDuplicate = await dealService.checkDuplicate(ticker, entryRaw, direction);
    if (isDuplicate) {
      reply.status(409).send({
        success: false,
        error: 'Duplicate: same setup created within the last 30 seconds',
      });
      return;
    }

    // 1. Always fetch candles — needed for Claude ohlcvSummary
    const marketData = await marketDataService.getMarketData(ticker, marketType);
    const { bars, currentBar } = marketData;

    // 2. ATR — from Extension override or computed from bars
    const atr = atrOverride && atrOverride > 0
      ? atrOverride
      : calculationService.computeAtrZy(bars).atr;

    // 3. passRoad — from Extension override or computed from bars
    const passRoad = passRoadOverride != null && passRoadOverride > 0
      ? passRoadOverride
      : calculationService.computePassRoad(bars, atr, currentBar);

    request.log.info({
      ticker,
      atrSource: atrOverride && atrOverride > 0 ? 'extension' : 'api',
      atr,
      passRoad,
    }, 'createNote ATR source');

    // 4. Calculate TP/SL/Qty using resolved ATR
    const calcResult = calculationService.calculateSetup({
      atr,
      passRoad,
      direction,
      entryRaw,
      openPrice: bars[bars.length - 1]?.[1],
      riskPercent,
      ratio,
      luftPercent,
      riskSum,
      customStop,
    });

    // 5. Save deal to DB
    const payload = {
      ticker, marketType, strategy, direction, entryRaw,
      customStop, riskPercent, ratio, luftPercent, riskSum,
      checklist,
    };
    const id = await dealService.createDeal(payload, calcResult);

    // Upload setup screenshot if provided (non-fatal)
    if (screenshot) {
      try {
        const screenshotUrl = await storageService.uploadScreenshot(screenshot, id, 'setup');
        await dealService.setScreenshot(id, 'setup', screenshotUrl);
      } catch (err) {
        request.log.warn({ err }, 'Screenshot upload failed (non-fatal)');
      }
    }

    // 6. Claude check — always has ohlcvSummary from bars
    const ohlcvSummary = marketDataService.formatOhlcvSummary(bars);
    const claudeCheck = await claudeService.checkSetup({
      ticker,
      marketType,
      strategy,
      direction,
      calcResult,
      checklist: checklist ?? { plus: [], minus: [], wait: [] },
      ohlcvSummary,
    });

    // 7. Save Claude result
    await dealService.setClaudeCheck(id, claudeCheck);

    // 8. Update status
    await dealService.updateDealStatus(id, 'notified');

    // 9. Send Telegram notification (non-fatal — bot may be unavailable)
    try {
      const deal = await dealService.getDealById(id);
      if (deal) {
        const keyboard = getDealActionKeyboard(id);
        await telegramService.sendScenario(deal, calcResult, claudeCheck, checklist, keyboard);
      }
    } catch (telegramErr) {
      request.log.warn({ err: telegramErr }, 'Telegram notification failed (non-fatal)');
    }

    // 10. Return response
    reply.send({ success: true, id, calcResult, claudeCheck });
  } catch (err) {
    request.log.error({ err }, 'createNote failed');
    reply.status(500).send({
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}
