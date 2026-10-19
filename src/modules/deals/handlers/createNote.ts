import type { FastifyRequest, FastifyReply } from 'fastify';
import { config } from '../../../config';
import {
  AiQuotaExceededError,
  BurstLimitExceededError,
  assertBurstLimit,
  claudeJobService,
  unavailableClaudeCheck,
} from '../../ai';
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
  notifier: DealNotifier,
): Promise<void> {
  try {
    const parsed = CreateNoteSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.status(400).send({ success: false, error: parsed.error.flatten() });
      return;
    }

    const input = parsed.data;
    const userId = currentUser(request).id;

    try {
      assertBurstLimit(
        `createNote:${userId}`,
        config.aiQuota.burstPerMinute,
        60_000,
      );
    } catch (err) {
      if (err instanceof BurstLimitExceededError) {
        reply.status(429).send({ success: false, error: err.message, code: err.code });
        return;
      }
      throw err;
    }

    const {
      ticker, marketType, strategy, direction,
      entryRaw, customStop, riskPercent, ratio, luftPercent, riskSum, checklist,
      screenshot, chart,
    } = input;

    const isDuplicate = await dealService.checkDuplicate(userId, ticker, entryRaw, direction);
    if (isDuplicate) {
      reply.status(409).send({
        success: false,
        error: 'Duplicate: same setup created within the last 30 seconds',
      });
      return;
    }

    const { calcResult, bars, atrSource } = await prepareSetup(input);
    request.log.info({
      ticker,
      atrSource,
      atr: calcResult.atr,
      passRoad: calcResult.passRoad,
    }, 'createNote ATR source');

    const payload = {
      ticker, marketType, strategy, direction, entryRaw,
      customStop, riskPercent, ratio, luftPercent, riskSum,
      checklist,
    };
    const id = await dealService.createDeal(userId, payload, calcResult);

    let setupScreenshotUrl: string | undefined;
    if (screenshot) {
      try {
        setupScreenshotUrl = await storageService.uploadScreenshot(screenshot, id, 'setup');
        await dealService.setScreenshot(id, 'setup', setupScreenshotUrl);
      } catch (err) {
        request.log.warn({ err }, 'Screenshot upload failed (non-fatal)');
      }
    }

    const ohlcvSummary = bars.length > 0 ? marketDataService.formatOhlcvSummary(bars) : undefined;
    const lossStreak = await dealService.getCurrentLossStreak(userId);
    const checklistSnap = checklist ?? { plus: [], minus: [], wait: [] };

    try {
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
          checklist: checklistSnap,
          ohlcvSummary,
          screenshotUrl: setupScreenshotUrl,
          chartPanes: chart?.panes,
          lossStreak,
          notifyTelegram: true,
        },
      });
      reply.send({ success: true, id, calcResult, claudePending: true, jobId });
    } catch (err) {
      if (!(err instanceof AiQuotaExceededError)) throw err;

      // Deal is saved; skip Claude, still notify Telegram with stub
      const claudeCheck = unavailableClaudeCheck(
        `Лимит AI на сегодня (${err.used}/${err.limit}). Расчёт без проверки Claude.`,
        `AI daily quota exceeded (${err.purpose})`,
      );
      await dealService.setClaudeCheck(id, claudeCheck);
      await dealService.updateDealStatus(id, 'notified');
      try {
        const deal = await dealService.getDealById(userId, id);
        if (deal) await notifier.notifyNewDeal(deal, calcResult, claudeCheck, checklistSnap);
      } catch (telegramErr) {
        request.log.warn({ err: telegramErr }, 'Telegram notification failed (non-fatal)');
      }
      reply.send({
        success: true,
        id,
        calcResult,
        claudePending: false,
        claudeSkipped: 'quota',
        error: err.message,
      });
    }
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
