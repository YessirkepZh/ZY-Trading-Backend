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
  const parsed = CreateNoteSchema.safeParse(request.body);
  if (!parsed.success) {
    reply.status(400).send({ success: false, error: parsed.error.flatten() });
    return;
  }

  const input = parsed.data;
  const {
    ticker, marketType, strategy, direction,
    entryRaw, customStop, riskPercent, ratio, luftPercent, riskSum, checklist, screenshot,
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

  // 1. Market data
  const { bars } = await marketDataService.getMarketData(ticker, marketType);

  // 2. Calculate ATR + TP/SL/Qty
  const calcResult = calculationService.calculateDeal({
    direction,
    entryRaw,
    riskPercent,
    ratio,
    luftPercent,
    riskSum,
    customStop,
    bars,
  });

  // 3. Save deal to DB
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

  // 4. Claude check
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

  // 5. Save Claude result
  await dealService.setClaudeCheck(id, claudeCheck);

  // 6. Update status
  await dealService.updateDealStatus(id, 'notified');

  // 7. Send Telegram notification (non-fatal — bot may be unavailable)
  try {
    const deal = await dealService.getDealById(id);
    if (deal) {
      const keyboard = getDealActionKeyboard(id);
      await telegramService.sendScenario(deal, calcResult, claudeCheck, checklist, keyboard);
    }
  } catch (telegramErr) {
    request.log.warn({ err: telegramErr }, 'Telegram notification failed (non-fatal)');
  }

  // 8. Return response
  reply.send({ success: true, id, calcResult, claudeCheck });
}
