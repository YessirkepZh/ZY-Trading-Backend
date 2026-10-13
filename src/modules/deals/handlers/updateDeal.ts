import type { FastifyRequest, FastifyReply } from 'fastify';
import { claudeService } from '../../ai';
import { storageService } from '../../storage';
import { currentUser } from '../../auth';
import * as calculationService from '../calculationService';
import * as dealService from '../dealService';
import { UpdateDealSchema } from '../schemas';
import type { Deal } from '../types';

interface DeviationLimit {
  atr: number;
  /** Fallback share of the entry when the deal has no ATR */
  share: number;
}

const MAX_CLOSE_DEVIATION: DeviationLimit = { atr: 5, share: 0.5 };
// A fill can slip, but not by more than a daily range
const MAX_ACTUAL_ENTRY_DEVIATION: DeviationLimit = { atr: 1, share: 0.1 };

/** Guards against a price carried over from another ticker; returns the error text or null */
function farFromEntryError(deal: Deal, price: number, what: string, limit: DeviationLimit): string | null {
  const entry = deal.calcResult.entryPrice || deal.entryRaw;
  const atr = deal.calcResult.atr;
  const maxDeviation = atr > 0 ? atr * limit.atr : entry * limit.share;
  if (Math.abs(price - entry) <= maxDeviation) return null;
  return `⚠️ ${what} ${price} слишком далеко от входа ${entry} по ${deal.ticker}. ` +
         `Проверь, что цена взята с правильного тикера.`;
}

export async function updateDealHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const parsed = UpdateDealSchema.safeParse(request.body);
  if (!parsed.success) {
    reply.status(400).send({ success: false, error: parsed.error.flatten() });
    return;
  }

  const { id, status, closePrice, actualEntryPrice, dealResult, screenshot } = parsed.data;
  const userId = currentUser(request).id;

  const deal = await dealService.getDealById(userId, id);
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

    const closeError = farFromEntryError(deal, closePrice, 'Цена закрытия', MAX_CLOSE_DEVIATION);
    if (closeError) {
      reply.status(400).send({ success: false, error: closeError });
      return;
    }
  }

  if (actualEntryPrice !== undefined) {
    if (status === 'missed') {
      reply.status(400).send({ success: false, error: 'Фактический вход не указывается для пропущенной сделки' });
      return;
    }
    const entryError = farFromEntryError(deal, actualEntryPrice, 'Фактический вход', MAX_ACTUAL_ENTRY_DEVIATION);
    if (entryError) {
      reply.status(400).send({ success: false, error: entryError });
      return;
    }
    const slippage = calculationService.calcSlippagePercent(
      deal.direction,
      calculationService.plannedEntryPrice(deal.calcResult),
      actualEntryPrice,
    );
    await dealService.setActualEntry(id, actualEntryPrice, slippage);
  }

  if (status === 'closed' && closePrice !== undefined && dealResult !== undefined) {
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
    const closedDeal = await dealService.getDealById(userId, id);
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
      await dealService.setEnteredAt(id);
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
