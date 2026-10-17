import type { FastifyRequest, FastifyReply } from 'fastify';
import { claudeJobService } from '../../ai';
import { marketDataService } from '../../market';
import { storageService } from '../../storage';
import { currentUser } from '../../auth';
import * as dealService from '../dealService';
import { CreateNoteSchema } from '../schemas';
import { prepareSetup, SetupValidationError } from '../setupService';
import type { DealNotifier } from '../types';

export function createNoteHandler(notifier: DealNotifier) {
  return (request: FastifyRequest, reply: FastifyReply): Promise<void> =>
    createNote(request, reply, notifier);
}

async function createNote(
  request: FastifyRequest,
  reply: FastifyReply,
  _notifier: DealNotifier,
): Promise<void> {
  try {
    const parsed = CreateNoteSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.status(400).send({ success: false, error: parsed.error.flatten() });
      return;
    }

    const input = parsed.data;
    const userId = currentUser(request).id;
    const {
      ticker, marketType, strategy, direction,
      entryRaw, customStop, riskPercent, ratio, luftPercent, riskSum, checklist,
      screenshot, chart,
    } = input;

    // Deduplication check
    const isDuplicate = await dealService.checkDuplicate(userId, ticker, entryRaw, direction);
    if (isDuplicate) {
      reply.status(409).send({
        success: false,
        error: 'Duplicate: same setup created within the last 30 seconds',
      });
      return;
    }

    // 1-4. Validate ATR, fetch candles, calculate TP/SL/Qty
    const { calcResult, bars, atrSource } = await prepareSetup(input);
    request.log.info({
      ticker,
      atrSource,
      atr: calcResult.atr,
      passRoad: calcResult.passRoad,
    }, 'createNote ATR source');

    // 5. Save deal to DB
    const payload = {
      ticker, marketType, strategy, direction, entryRaw,
      customStop, riskPercent, ratio, luftPercent, riskSum,
      checklist,
    };
    const id = await dealService.createDeal(userId, payload, calcResult);

    // Upload setup screenshot if provided (non-fatal)
    let setupScreenshotUrl: string | undefined;
    if (screenshot) {
      try {
        setupScreenshotUrl = await storageService.uploadScreenshot(screenshot, id, 'setup');
        await dealService.setScreenshot(id, 'setup', setupScreenshotUrl);
      } catch (err) {
        request.log.warn({ err }, 'Screenshot upload failed (non-fatal)');
      }
    }

    // 6. Enqueue Claude check + Telegram (worker); HTTP returns immediately
    const ohlcvSummary = bars.length > 0 ? marketDataService.formatOhlcvSummary(bars) : undefined;
    const lossStreak = await dealService.getCurrentLossStreak(userId);
    const jobId = await claudeJobService.enqueueJob({
      userId,
      dealId: id,
      jobType: 'check_setup',
      payload: {
        ticker,
        marketType,
        strategy,
        direction,
        entryRaw,
        calcResult,
        checklist: checklist ?? { plus: [], minus: [], wait: [] },
        ohlcvSummary,
        screenshotUrl: setupScreenshotUrl,
        chartPanes: chart?.panes,
        lossStreak,
        notifyTelegram: true,
      },
    });

    reply.send({ success: true, id, calcResult, claudePending: true, jobId });
  } catch (err) {
    if (err instanceof SetupValidationError) {
      reply.status(400).send({ success: false, error: err.message });
      return;
    }
    request.log.error({ err }, 'createNote failed');
    reply.status(500).send({
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}
