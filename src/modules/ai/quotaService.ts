import { pool } from '../../db/pool';
import { config } from '../../config';
import type { ClaudeJobType } from './claudeJobService';
import type { AiPurpose } from './aiUsageService';

export class AiQuotaExceededError extends Error {
  readonly code = 'AI_QUOTA_EXCEEDED';
  readonly purpose: string;
  readonly limit: number;
  readonly used: number;

  constructor(purpose: string, used: number, limit: number) {
    super(
      `Дневной лимит AI (${purpose}): ${used}/${limit}. Попробуй завтра или уменьши частоту.`,
    );
    this.name = 'AiQuotaExceededError';
    this.purpose = purpose;
    this.used = used;
    this.limit = limit;
  }
}

function jobTypeToPurpose(jobType: ClaudeJobType): AiPurpose {
  switch (jobType) {
    case 'check_setup': return 'check_setup';
    case 'analyze_closed': return 'analyze_closed';
    case 'analysis_report': return 'analysis_report';
    default: return 'other';
  }
}

function limitFor(purpose: AiPurpose): number {
  const q = config.aiQuota;
  switch (purpose) {
    case 'check_setup': return q.dailyCheckSetup;
    case 'analyze_closed': return q.dailyAnalyzeClosed;
    case 'analysis_report': return q.dailyAnalysisReport;
    default: return q.dailyCheckSetup;
  }
}

async function countUsageToday(userId: number, purpose: AiPurpose): Promise<number> {
  const { rows } = await pool.query<{ n: string }>(`
    SELECT COUNT(*)::text AS n
    FROM ai_usage_logs
    WHERE user_id = $1
      AND purpose = $2
      AND ok = TRUE
      AND created_at >= date_trunc('day', NOW())
  `, [userId, purpose]);
  return Number(rows[0]?.n ?? 0);
}

async function countPendingJobsToday(userId: number, jobType: ClaudeJobType): Promise<number> {
  const { rows } = await pool.query<{ n: string }>(`
    SELECT COUNT(*)::text AS n
    FROM claude_jobs
    WHERE user_id = $1
      AND job_type = $2
      AND status IN ('pending', 'running')
      AND created_at >= date_trunc('day', NOW())
  `, [userId, jobType]);
  return Number(rows[0]?.n ?? 0);
}

async function sumEstimatedCostToday(userId: number): Promise<number> {
  const { rows } = await pool.query<{ c: string }>(`
    SELECT COALESCE(SUM(estimated_cost_usd), 0)::text AS c
    FROM ai_usage_logs
    WHERE user_id = $1
      AND ok = TRUE
      AND created_at >= date_trunc('day', NOW())
  `, [userId]);
  return Number(rows[0]?.c ?? 0);
}

/** Throws AiQuotaExceededError when the user is over daily caps. */
export async function assertAiQuota(userId: number, jobType: ClaudeJobType): Promise<void> {
  if (!config.aiQuota.enabled) return;

  const purpose = jobTypeToPurpose(jobType);
  const limit = limitFor(purpose);
  const [usedLogs, usedPending] = await Promise.all([
    countUsageToday(userId, purpose),
    countPendingJobsToday(userId, jobType),
  ]);
  const used = usedLogs + usedPending;
  if (used >= limit) {
    throw new AiQuotaExceededError(purpose, used, limit);
  }

  const costCap = config.aiQuota.dailyCostUsd;
  if (costCap > 0) {
    const spent = await sumEstimatedCostToday(userId);
    if (spent >= costCap) {
      throw new AiQuotaExceededError(
        'daily_cost_usd',
        Math.round(spent * 1000) / 1000,
        costCap,
      );
    }
  }
}

/** Simple in-memory burst limit (per process). $0, resets on restart. */
const bursts = new Map<string, { count: number; resetAt: number }>();

export class BurstLimitExceededError extends Error {
  readonly code = 'BURST_LIMIT';
  constructor(message: string) {
    super(message);
    this.name = 'BurstLimitExceededError';
  }
}

export function assertBurstLimit(key: string, max: number, windowMs: number): void {
  if (max <= 0) return;
  const now = Date.now();
  const cur = bursts.get(key);
  if (!cur || now >= cur.resetAt) {
    bursts.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }
  cur.count += 1;
  if (cur.count > max) {
    throw new BurstLimitExceededError(
      `Слишком частые запросы. Подожди ${Math.ceil((cur.resetAt - now) / 1000)} с.`,
    );
  }
}
