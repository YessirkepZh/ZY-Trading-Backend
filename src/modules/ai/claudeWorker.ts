import { config } from '../../config';
import * as dealService from '../deals/dealService';
import * as analysisReportService from '../analytics/analysisReportService';
import { marketContextService } from '../market';
import { notifyNewDeal } from '../telegram/telegramService';
import * as claudeService from './claudeService';
import type { ClaudeCheckResult } from './types';
import {
  claimNextJob,
  markJobDone,
  markJobFailed,
  recoverStaleJobs,
  type AnalysisReportPayload,
  type CheckSetupPayload,
  type ClaudeJob,
} from './claudeJobService';

const POLL_MS = 2_000;
let timer: ReturnType<typeof setInterval> | null = null;
let busy = false;

/** Fallback when Claude never answered — Telegram still gets the calc + keyboard. */
function unavailableClaudeCheck(error: string): ClaudeCheckResult {
  return {
    recommendation: 'wait',
    confidence: 0,
    reasoning: `Claude unavailable: ${error}`,
    reasoningRu:
      'Claude не ответил после нескольких попыток. Решение принимай самостоятельно по расчёту выше.',
    warnings: ['Claude check failed — setup not reviewed by AI'],
    warningsRu: ['Claude недоступен — AI-проверка сетапа пропущена'],
    checkedAt: new Date(),
  };
}

async function notifyCheckSetupFallback(job: ClaudeJob, error: string): Promise<void> {
  if (job.dealId == null) return;
  const payload = job.payload as CheckSetupPayload;
  if (!payload.notifyTelegram) return;

  const claudeCheck = unavailableClaudeCheck(error);
  try {
    await dealService.setClaudeCheck(job.dealId, claudeCheck);
    await dealService.updateDealStatus(job.dealId, 'notified');
  } catch (err) {
    console.warn('[claudeWorker] fallback setClaudeCheck failed', err);
  }

  const deal = await dealService.getDealById(job.userId, job.dealId);
  if (!deal) return;
  try {
    await notifyNewDeal(deal, payload.calcResult, claudeCheck, payload.checklist);
    console.log(`[claudeWorker] job #${job.id} Telegram sent without Claude`);
  } catch (err) {
    console.warn('[claudeWorker] fallback Telegram notify failed', err);
  }
}

async function processJob(job: ClaudeJob): Promise<void> {
  switch (job.jobType) {
    case 'check_setup':
      await processCheckSetup(job);
      break;
    case 'analyze_closed':
      await processAnalyzeClosed(job);
      break;
    case 'analysis_report':
      await processAnalysisReport(job);
      break;
    default:
      throw new Error(`Unknown job type: ${job.jobType as string}`);
  }
}

async function processCheckSetup(job: ClaudeJob): Promise<void> {
  if (job.dealId == null) throw new Error('check_setup: missing deal_id');
  const payload = job.payload as CheckSetupPayload;

  const marketContext = await marketContextService.getMarketContextPromptBlock();

  const claudeCheck = await claudeService.checkSetup({
    userId: job.userId,
    ticker: payload.ticker,
    marketType: payload.marketType,
    strategy: payload.strategy,
    direction: payload.direction,
    entryRaw: payload.entryRaw,
    calcResult: payload.calcResult,
    checklist: payload.checklist,
    ohlcvSummary: payload.ohlcvSummary,
    screenshotUrl: payload.screenshotUrl,
    chartPanes: payload.chartPanes,
    lossStreak: payload.lossStreak,
    marketContext,
  });

  await dealService.setClaudeCheck(job.dealId, claudeCheck);
  await dealService.updateDealStatus(job.dealId, 'notified');

  if (payload.notifyTelegram) {
    const deal = await dealService.getDealById(job.userId, job.dealId);
    if (deal) {
      try {
        await notifyNewDeal(deal, payload.calcResult, claudeCheck, payload.checklist);
      } catch (err) {
        console.warn('[claudeWorker] Telegram notify failed (non-fatal)', err);
      }
    }
  }
}

async function processAnalyzeClosed(job: ClaudeJob): Promise<void> {
  if (job.dealId == null) throw new Error('analyze_closed: missing deal_id');
  const deal = await dealService.getDealById(job.userId, job.dealId);
  if (!deal) throw new Error(`analyze_closed: deal #${job.dealId} not found`);
  if (deal.status !== 'closed') {
    console.warn(`[claudeWorker] deal #${job.dealId} not closed yet — skipping`);
    return;
  }
  const stats = await claudeService.analyzeClosedDeal(deal);
  await dealService.setClaudeStats(job.dealId, stats);
}

async function processAnalysisReport(job: ClaudeJob): Promise<void> {
  const payload = job.payload as AnalysisReportPayload;
  const { summary, contentHtml } = await claudeService.generateAnalysisReport({
    periodFrom: payload.periodFrom,
    periodTo: payload.periodTo,
    metrics: payload.metrics,
  });
  await analysisReportService.updateReportContent(payload.reportId, job.userId, {
    summary,
    contentHtml,
  });
}

async function tick(): Promise<void> {
  if (busy) return;
  busy = true;
  try {
    await recoverStaleJobs(10);
    const job = await claimNextJob();
    if (!job) return;
    console.log(`[claudeWorker] job #${job.id} ${job.jobType} attempt ${job.attempts}`);
    try {
      await processJob(job);
      await markJobDone(job.id);
      console.log(`[claudeWorker] job #${job.id} done`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[claudeWorker] job #${job.id} failed:`, msg);
      const permanentlyFailed = await markJobFailed(job.id, msg, job.attempts, job.maxAttempts);
      // Deal Telegram must not depend on Claude succeeding
      if (permanentlyFailed && job.jobType === 'check_setup') {
        await notifyCheckSetupFallback(job, msg);
      }
    }
  } catch (err) {
    console.error('[claudeWorker] tick error:', err);
  } finally {
    busy = false;
  }
}

/** In-process poller: concurrency 1, SKIP LOCKED safe across replicas. */
export function startClaudeWorker(): void {
  if (timer) return;
  if (config.claudeQueue.enabled === false) {
    console.warn('[claudeWorker] disabled (CLAUDE_QUEUE_ENABLED=false)');
    return;
  }
  console.log(`[claudeWorker] started (poll ${POLL_MS}ms)`);
  void tick();
  timer = setInterval(() => { void tick(); }, POLL_MS);
}

export function stopClaudeWorker(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}
