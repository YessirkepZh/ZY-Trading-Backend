import type { FastifyRequest, FastifyReply } from 'fastify';
import { UpdateDealSchema } from '../../utils/validators';
import * as dealService from '../../services/dealService';
import * as storageService from '../../services/storageService';
import * as claudeService from '../../services/claudeService';
import { pool } from '../../db/pool';

const MAX_CLOSE_DEVIATION_ATR = 5;
const MAX_CLOSE_DEVIATION_PCT = 0.5;

export async function updateDealHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const parsed = UpdateDealSchema.safeParse(request.body);
  if (!parsed.success) {
    reply.status(400).send({ success: false, error: parsed.error.flatten() });
    return;
  }

  const { id, status, closePrice, dealResult, screenshot } = parsed.data;

  const deal = await dealService.getDealById(id);
  if (!deal) {
    reply.status(404).send({ success: false, error: `Deal #${id} not found` });
    return;
  }

  if (status === 'closed') {
    if (closePrice === undefined || dealResult === undefined) {
      reply.status(400).send({
        success: false,
        error: 'closePrice and dealResult are required when status is closed',
      });
      return;
    }

    // Guards against a close price carried over from another ticker
    const entry = deal.calcResult.entryPrice || deal.entryRaw;
    const atr = deal.calcResult.atr;
    const maxDeviation = atr > 0 ? atr * MAX_CLOSE_DEVIATION_ATR : entry * MAX_CLOSE_DEVIATION_PCT;
    if (Math.abs(closePrice - entry) > maxDeviation) {
      reply.status(400).send({
        success: false,
        error: `⚠️ Цена закрытия ${closePrice} слишком далека от входа ${entry} по ${deal.ticker}. ` +
               `Проверь, что цена взята с правильного тикера.`,
      });
      return;
    }

    await dealService.closeDeal(id, closePrice, dealResult);

    // Record checklist stats for analytics
    if (deal.checklistSnapshot) {
      try {
        await dealService.saveChecklistStats(id, deal.strategy, deal.checklistSnapshot, dealResult);
      } catch (err) {
        console.error('saveChecklistStats failed (non-fatal)', err);
      }
    }

    if (screenshot) {
      try {
        const url = await storageService.uploadScreenshot(screenshot, id, 'close');
        await dealService.setScreenshot(id, 'close', url);
      } catch (err) {
        console.error('Close screenshot upload failed', err);
      }
    }

    // Reload deal for Claude analysis
    const closedDeal = await dealService.getDealById(id);
    if (closedDeal) {
      try {
        const statsResult = await claudeService.analyzeClosedDeal(closedDeal);
        await dealService.setClaudeStats(id, statsResult);
      } catch (err) {
        // Non-fatal: log and continue
        console.error('Claude analysis failed for deal', id, err);
      }
    }
  } else {
    await dealService.updateDealStatus(id, status, {
      hasDeal: status === 'entered',
    });

    if (status === 'entered') {
      await pool.query('UPDATE deals SET entered_at = NOW() WHERE id = $1', [id]);
    }

    if (status === 'entered' && screenshot) {
      try {
        const url = await storageService.uploadScreenshot(screenshot, id, 'entry');
        await dealService.setScreenshot(id, 'entry', url);
      } catch (err) {
        console.error('Entry screenshot upload failed', err);
      }
    }
  }

  reply.send({ success: true, id, status });
}
