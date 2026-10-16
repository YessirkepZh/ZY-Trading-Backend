import { pool } from '../../db/pool';
import type { Strategy } from '../../shared/trading';
import type { ClaudeCheckResult, ClaudeStatsResult } from '../ai';
import type { CalculationResult, Deal, DealComment, DealPayload, DealStatus, ScreenshotType } from './types';

// ── Row mapper ────────────────────────────────────────────────────────────────

function mapRowToDeal(row: Record<string, unknown>): Deal {
  return {
    id: row['id'] as number,
    userId: row['user_id'] as number,
    ticker: row['ticker'] as string,
    marketType: row['market_type'] as Deal['marketType'],
    strategy: row['strategy'] as Deal['strategy'],
    direction: row['direction'] as Deal['direction'],
    entryRaw: Number(row['entry_raw']),
    status: row['status'] as DealStatus,
    payload: (row['payload'] as DealPayload) ?? {},
    calcResult: (row['calc_result'] as CalculationResult) ?? {},
    claudeCheckResult: row['claude_check_result'] as Deal['claudeCheckResult'],
    checklistSnapshot: row['checklist_snapshot'] as Deal['checklistSnapshot'],
    hasDeal: Boolean(row['has_deal']),
    dealResult: row['deal_result'] as Deal['dealResult'],
    closePrice: row['close_price'] != null ? Number(row['close_price']) : undefined,
    actualEntryPrice: row['actual_entry_price'] != null ? Number(row['actual_entry_price']) : undefined,
    slippagePercent: row['slippage_percent'] != null ? Number(row['slippage_percent']) : undefined,
    closedAt: row['closed_at'] != null ? new Date(row['closed_at'] as string) : undefined,
    enteredAt: row['entered_at'] != null ? new Date(row['entered_at'] as string) : undefined,
    claudeStatsResult: row['claude_stats_result'] as Deal['claudeStatsResult'],
    screenshotSetup: row['screenshot_setup'] as string | undefined,
    screenshotEntry: row['screenshot_entry'] as string | undefined,
    screenshotClose: row['screenshot_close'] as string | undefined,
    screenshotFocus: row['screenshot_focus'] as string | undefined,
    createdAt: new Date(row['created_at'] as string),
    updatedAt: new Date(row['updated_at'] as string),
  };
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function createDeal(
  userId: number,
  payload: DealPayload,
  calcResult: CalculationResult,
): Promise<number> {
  const result = await pool.query<{ id: number }>(
    `INSERT INTO deals
       (ticker, market_type, strategy, direction, entry_raw, status, payload, calc_result,
        checklist_snapshot, pass_road, atr, atr_percent, user_id)
     VALUES ($1,$2,$3,$4,$5,'created',$6,$7,$8,$9,$10,$11,$12)
     RETURNING id`,
    [
      payload.ticker,
      payload.marketType,
      payload.strategy,
      payload.direction,
      payload.entryRaw,
      JSON.stringify(payload),
      JSON.stringify(calcResult),
      payload.checklist ? JSON.stringify(payload.checklist) : null,
      calcResult.passRoad,
      calcResult.atr,
      calcResult.atrPercent ?? null,
      userId,
    ],
  );

  const row = result.rows[0];
  if (!row) throw new Error('createDeal: no row returned');
  return row.id;
}

export async function updateDealStatus(
  id: number,
  status: DealStatus,
  extra: Partial<Pick<Deal, 'hasDeal'>> = {},
): Promise<void> {
  const updates: string[] = ['status = $2', 'updated_at = NOW()'];
  const values: unknown[] = [id, status];

  if (extra.hasDeal !== undefined) {
    values.push(extra.hasDeal);
    updates.push(`has_deal = $${values.length}`);
  }

  await pool.query(
    `UPDATE deals SET ${updates.join(', ')} WHERE id = $1`,
    values,
  );
}

export async function setEnteredAt(id: number, at?: Date): Promise<void> {
  await pool.query('UPDATE deals SET entered_at = COALESCE($2, NOW()) WHERE id = $1', [id, at ?? null]);
}

export async function setActualEntry(
  id: number,
  actualEntryPrice: number,
  slippagePercent: number,
): Promise<void> {
  await pool.query(
    `UPDATE deals SET actual_entry_price = $2, slippage_percent = $3, updated_at = NOW() WHERE id = $1`,
    [id, actualEntryPrice, slippagePercent],
  );
}

export async function setClaudeCheck(id: number, result: ClaudeCheckResult): Promise<void> {
  await pool.query(
    `UPDATE deals SET claude_check_result = $2, updated_at = NOW() WHERE id = $1`,
    [id, JSON.stringify(result)],
  );
}

export async function closeDeal(
  id: number,
  closePrice: number,
  dealResult: 'win' | 'loss' | 'breakeven',
): Promise<void> {
  await pool.query(
    `UPDATE deals
     SET status = 'closed', close_price = $2, deal_result = $3,
         closed_at = NOW(), has_deal = TRUE, updated_at = NOW()
     WHERE id = $1`,
    [id, closePrice, dealResult],
  );
}

export async function setScreenshot(
  id: number,
  type: ScreenshotType,
  url: string,
): Promise<void> {
  const column = `screenshot_${type}`;
  await pool.query(
    `UPDATE deals SET ${column} = $1, updated_at = NOW() WHERE id = $2`,
    [url, id],
  );
}

export async function saveChecklistStats(
  dealId: number,
  strategy: string,
  snapshot: { plus: string[]; minus: string[]; wait: string[] },
  dealResult: 'win' | 'loss' | 'breakeven',
): Promise<void> {
  const entries: Array<[string, string]> = [
    ...snapshot.plus.map((k): [string, string] => [k, 'plus']),
    ...snapshot.minus.map((k): [string, string] => [k, 'minus']),
    ...snapshot.wait.map((k): [string, string] => [k, 'wait']),
  ];

  if (entries.length === 0) return;

  const values: unknown[] = [];
  const rows = entries.map(([key, type]) => {
    const base = values.length;
    values.push(dealId, strategy, key, type, dealResult);
    return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`;
  });

  await pool.query(
    `INSERT INTO checklist_stats (deal_id, strategy, item_key, item_type, deal_result)
     VALUES ${rows.join(', ')}
     ON CONFLICT DO NOTHING`,
    values,
  );
}

export async function setClaudeStats(id: number, result: ClaudeStatsResult): Promise<void> {
  await pool.query(
    `UPDATE deals SET claude_stats_result = $2, updated_at = NOW() WHERE id = $1`,
    [id, JSON.stringify(result)],
  );
}

export async function getDealById(userId: number, id: number): Promise<Deal | null> {
  const result = await pool.query<Record<string, unknown>>(
    'SELECT * FROM deals WHERE id = $1 AND user_id = $2',
    [id, userId],
  );
  const row = result.rows[0];
  return row ? mapRowToDeal(row) : null;
}

// An order not filled within a few days is a forgotten setup, not a pending one
const OPEN_SETUP_DAYS = 3;

export async function getDeals(userId: number, filters: {
  status?: DealStatus;
  strategy?: Strategy;
  open?: boolean;
  limit?: number;
  offset?: number;
} = {}): Promise<Deal[]> {
  const { status, strategy, open, limit = 20, offset = 0 } = filters;
  const values: unknown[] = [userId];
  const conditions: string[] = ['user_id = $1'];

  if (status) {
    values.push(status);
    conditions.push(`status = $${values.length}`);
  }
  if (open) {
    values.push(OPEN_SETUP_DAYS);
    conditions.push(
      `(status = 'entered' OR (status IN ('created', 'notified') AND created_at > NOW() - make_interval(days => $${values.length})))`,
    );
  }
  if (strategy) {
    values.push(strategy);
    conditions.push(`strategy = $${values.length}`);
  }

  const where = `WHERE ${conditions.join(' AND ')}`;
  values.push(limit, offset);

  const result = await pool.query<Record<string, unknown>>(
    `SELECT * FROM deals ${where} ORDER BY created_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
  );

  return result.rows.map(mapRowToDeal);
}

export async function checkDuplicate(
  userId: number,
  ticker: string,
  entryRaw: number,
  direction: string,
): Promise<boolean> {
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM deals
     WHERE user_id = $4 AND ticker = $1 AND entry_raw = $2 AND direction = $3
       AND created_at > NOW() - INTERVAL '30 seconds'`,
    [ticker, entryRaw, direction, userId],
  );
  const row = result.rows[0];
  return Number(row?.count ?? 0) > 0;
}

// ── Comments ──────────────────────────────────────────────────────────────────

function mapRowToComment(row: Record<string, unknown>): DealComment {
  return {
    id: row['id'] as number,
    dealId: row['deal_id'] as number,
    text: row['text'] as string,
    createdAt: new Date(row['created_at'] as string),
  };
}

/**
 * How many losses in a row end at the most recent closed win/loss.
 * 0 = last closed deal was a win (or there are no closed deals yet).
 */
export async function getCurrentLossStreak(userId: number): Promise<number> {
  const result = await pool.query<{ deal_result: string }>(
    `SELECT deal_result
     FROM deals
     WHERE user_id = $1
       AND status = 'closed'
       AND deal_result IN ('win', 'loss')
       AND closed_at IS NOT NULL
     ORDER BY closed_at DESC
     LIMIT 20`,
    [userId],
  );

  let streak = 0;
  for (const row of result.rows) {
    if (row.deal_result !== 'loss') break;
    streak += 1;
  }
  return streak;
}

export async function getDealComments(dealId: number): Promise<DealComment[]> {
  const result = await pool.query<Record<string, unknown>>(
    `SELECT * FROM deal_comments WHERE deal_id = $1 ORDER BY created_at ASC`,
    [dealId],
  );
  return result.rows.map(mapRowToComment);
}

export async function addDealComment(
  userId: number,
  dealId: number,
  text: string,
): Promise<DealComment> {
  const result = await pool.query<Record<string, unknown>>(
    `INSERT INTO deal_comments (deal_id, text, user_id) VALUES ($1, $2, $3) RETURNING *`,
    [dealId, text, userId],
  );
  const row = result.rows[0];
  if (!row) throw new Error('addDealComment: no row returned');
  return mapRowToComment(row);
}
