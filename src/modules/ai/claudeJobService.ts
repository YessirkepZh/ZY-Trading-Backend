import { pool } from '../../db/pool';
import type { ChartPane } from './types';
import type { AnalysisMetrics } from '../analytics/types';
import type { CalculationResult } from '../deals/types';
import type { ChecklistSnapshot, Direction, MarketType, Strategy } from '../../shared/trading';

export type ClaudeJobType = 'check_setup' | 'analyze_closed' | 'analysis_report';

export type ClaudeJobStatus = 'pending' | 'running' | 'done' | 'failed';

export interface CheckSetupPayload {
  ticker: string;
  marketType: MarketType;
  strategy: Strategy;
  direction: Direction;
  entryRaw: number;
  calcResult: CalculationResult;
  checklist: ChecklistSnapshot;
  ohlcvSummary?: string;
  screenshotUrl?: string;
  chartPanes?: ChartPane[];
  lossStreak: number;
  /** When true, worker sends Telegram after Claude finishes */
  notifyTelegram: boolean;
}

export interface AnalyzeClosedPayload {
  /** empty — worker loads deal by deal_id */
}

export interface AnalysisReportPayload {
  reportId: number;
  periodFrom: string;
  periodTo: string;
  metrics: AnalysisMetrics;
}

export type ClaudeJobPayload =
  | CheckSetupPayload
  | AnalyzeClosedPayload
  | AnalysisReportPayload;

export interface ClaudeJob {
  id: number;
  userId: number;
  dealId: number | null;
  jobType: ClaudeJobType;
  payload: ClaudeJobPayload;
  status: ClaudeJobStatus;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
}

interface JobRow {
  id: number;
  user_id: number;
  deal_id: number | null;
  job_type: ClaudeJobType;
  payload: ClaudeJobPayload;
  status: ClaudeJobStatus;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
}

function mapRow(row: JobRow): ClaudeJob {
  return {
    id: row.id,
    userId: row.user_id,
    dealId: row.deal_id,
    jobType: row.job_type,
    payload: row.payload,
    status: row.status,
    attempts: row.attempts,
    maxAttempts: row.max_attempts,
    lastError: row.last_error,
  };
}

export async function enqueueJob(params: {
  userId: number;
  dealId?: number | null;
  jobType: ClaudeJobType;
  payload: ClaudeJobPayload;
  maxAttempts?: number;
}): Promise<number> {
  // Avoid stacking duplicate analyze_closed / check_setup for the same deal
  if (params.dealId != null && (params.jobType === 'analyze_closed' || params.jobType === 'check_setup')) {
    const existing = await pool.query<{ id: number }>(`
      SELECT id FROM claude_jobs
      WHERE deal_id = $1 AND job_type = $2 AND status IN ('pending', 'running')
      LIMIT 1
    `, [params.dealId, params.jobType]);
    if (existing.rows[0]) return existing.rows[0].id;
  }

  const result = await pool.query<{ id: number }>(`
    INSERT INTO claude_jobs (user_id, deal_id, job_type, payload, max_attempts)
    VALUES ($1, $2, $3, $4::jsonb, $5)
    RETURNING id
  `, [
    params.userId,
    params.dealId ?? null,
    params.jobType,
    JSON.stringify(params.payload),
    params.maxAttempts ?? 3,
  ]);
  const row = result.rows[0];
  if (!row) throw new Error('enqueueJob: no row returned');
  return row.id;
}

/** Re-queue stuck running jobs (process crash mid-Claude call). */
export async function recoverStaleJobs(staleMinutes = 10): Promise<number> {
  const result = await pool.query(`
    UPDATE claude_jobs
    SET status = 'pending', started_at = NULL, run_after = NOW()
    WHERE status = 'running'
      AND started_at < NOW() - ($1 * INTERVAL '1 minute')
  `, [staleMinutes]);
  return result.rowCount ?? 0;
}

/** Claim one pending job with SKIP LOCKED (safe for multiple Backend instances). */
export async function claimNextJob(): Promise<ClaudeJob | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query<JobRow>(`
      SELECT id, user_id, deal_id, job_type, payload, status, attempts, max_attempts, last_error
      FROM claude_jobs
      WHERE status = 'pending'
        AND (run_after IS NULL OR run_after <= NOW())
      ORDER BY id
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    `);
    const row = rows[0];
    if (!row) {
      await client.query('COMMIT');
      return null;
    }
    const { rows: updated } = await client.query<JobRow>(`
      UPDATE claude_jobs
      SET status = 'running', started_at = NOW(), attempts = attempts + 1
      WHERE id = $1
      RETURNING id, user_id, deal_id, job_type, payload, status, attempts, max_attempts, last_error
    `, [row.id]);
    await client.query('COMMIT');
    const claimed = updated[0];
    return claimed ? mapRow(claimed) : null;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function markJobDone(id: number): Promise<void> {
  await pool.query(`
    UPDATE claude_jobs
    SET status = 'done', finished_at = NOW(), last_error = NULL
    WHERE id = $1
  `, [id]);
}

/**
 * Exponential backoff: 30s, 2m, 8m … then failed.
 * @returns true when the job is permanently failed (no more retries)
 */
export async function markJobFailed(
  id: number,
  error: string,
  attempts: number,
  maxAttempts: number,
): Promise<boolean> {
  if (attempts >= maxAttempts) {
    await pool.query(`
      UPDATE claude_jobs
      SET status = 'failed', finished_at = NOW(), last_error = $2
      WHERE id = $1
    `, [id, error.slice(0, 2000)]);
    return true;
  }
  const delaySec = Math.min(30 * Math.pow(4, attempts - 1), 3600);
  await pool.query(`
    UPDATE claude_jobs
    SET status = 'pending', started_at = NULL,
        run_after = NOW() + ($2 * INTERVAL '1 second'), last_error = $3
    WHERE id = $1
  `, [id, delaySec, error.slice(0, 2000)]);
  return false;
}
