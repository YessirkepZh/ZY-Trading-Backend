import { pool } from '../db/pool';
import type { Deal, DealPayload, DealStatus, DashboardStats, Strategy, MarketType, DealComment } from '../types/deal';
import type { CalculationResult, ClaudeCheckResult, ClaudeStatsResult } from '../types/calculation';

// ── Row mapper ────────────────────────────────────────────────────────────────

function mapRowToDeal(row: Record<string, unknown>): Deal {
  return {
    id: row['id'] as number,
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
    closedAt: row['closed_at'] != null ? new Date(row['closed_at'] as string) : undefined,
    claudeStatsResult: row['claude_stats_result'] as Deal['claudeStatsResult'],
    screenshotSetup: row['screenshot_setup'] as string | undefined,
    screenshotEntry: row['screenshot_entry'] as string | undefined,
    screenshotClose: row['screenshot_close'] as string | undefined,
    createdAt: new Date(row['created_at'] as string),
    updatedAt: new Date(row['updated_at'] as string),
  };
}

// ── CRUD ──────────────────────────────────────────────────────────────────────

export async function createDeal(
  payload: DealPayload,
  calcResult: CalculationResult,
): Promise<number> {
  const result = await pool.query<{ id: number }>(
    `INSERT INTO deals
       (ticker, market_type, strategy, direction, entry_raw, status, payload, calc_result,
        checklist_snapshot, pass_road, atr, atr_percent)
     VALUES ($1,$2,$3,$4,$5,'created',$6,$7,$8,$9,$10,$11)
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
  type: 'setup' | 'entry' | 'close',
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

export async function getDealById(id: number): Promise<Deal | null> {
  const result = await pool.query<Record<string, unknown>>(
    'SELECT * FROM deals WHERE id = $1',
    [id],
  );
  const row = result.rows[0];
  return row ? mapRowToDeal(row) : null;
}

export async function getDeals(filters: {
  status?: DealStatus;
  strategy?: Strategy;
  limit?: number;
  offset?: number;
} = {}): Promise<Deal[]> {
  const { status, strategy, limit = 20, offset = 0 } = filters;
  const conditions: string[] = [];
  const values: unknown[] = [];

  if (status) {
    values.push(status);
    conditions.push(`status = $${values.length}`);
  }
  if (strategy) {
    values.push(strategy);
    conditions.push(`strategy = $${values.length}`);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  values.push(limit, offset);

  const result = await pool.query<Record<string, unknown>>(
    `SELECT * FROM deals ${where} ORDER BY created_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
  );

  return result.rows.map(mapRowToDeal);
}

export async function checkDuplicate(
  ticker: string,
  entryRaw: number,
  direction: string,
): Promise<boolean> {
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*) as count FROM deals
     WHERE ticker = $1 AND entry_raw = $2 AND direction = $3
       AND created_at > NOW() - INTERVAL '30 seconds'`,
    [ticker, entryRaw, direction],
  );
  const row = result.rows[0];
  return Number(row?.count ?? 0) > 0;
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export async function getDashboardStats(): Promise<DashboardStats> {
  const [totalResult, stratResult, marketResult, passRoadResult, recentResult] = await Promise.all([
    pool.query<{ total: string; wins: string }>(
      `SELECT COUNT(*) as total,
              COUNT(*) FILTER (WHERE deal_result = 'win') as wins
       FROM deals WHERE has_deal = true`,
    ),
    pool.query<{ strategy: string; total: string; wins: string }>(
      `SELECT strategy,
              COUNT(*) as total,
              COUNT(*) FILTER (WHERE deal_result = 'win') as wins
       FROM deals WHERE has_deal = true
       GROUP BY strategy`,
    ),
    pool.query<{ market_type: string; total: string; wins: string; losses: string }>(
      `SELECT market_type,
              COUNT(*) as total,
              COUNT(*) FILTER (WHERE deal_result = 'win') as wins,
              COUNT(*) FILTER (WHERE deal_result = 'loss') as losses
       FROM deals WHERE has_deal = true
       GROUP BY market_type`,
    ),
    pool.query<{ avg_pass_road: string }>(
      `SELECT AVG(pass_road) as avg_pass_road
       FROM deals WHERE has_deal = true AND deal_result = 'win' AND pass_road IS NOT NULL`,
    ),
    pool.query<Record<string, unknown>>(
      `SELECT * FROM deals ORDER BY created_at DESC LIMIT 10`,
    ),
  ]);

  const totalRow = totalResult.rows[0];
  const totalDeals = Number(totalRow?.total ?? 0);
  const totalWins = Number(totalRow?.wins ?? 0);
  const winRate = totalDeals > 0 ? Math.round((totalWins / totalDeals) * 100) : 0;

  const avgPassRoadRow = passRoadResult.rows[0];
  const avgPassRoad = Math.round(Number(avgPassRoadRow?.avg_pass_road ?? 0));

  const allStrategies: Strategy[] = ['Пробой', 'Ложный Пробой', 'Отбой'];
  const byStrategy = {} as Record<Strategy, { total: number; wins: number; winRate: number }>;

  for (const s of allStrategies) {
    byStrategy[s] = { total: 0, wins: 0, winRate: 0 };
  }

  for (const row of stratResult.rows) {
    const s = row.strategy as Strategy;
    const total = Number(row.total);
    const wins = Number(row.wins);
    byStrategy[s] = {
      total,
      wins,
      winRate: total > 0 ? Math.round((wins / total) * 100) : 0,
    };
  }

  const allMarkets: MarketType[] = ['crypto', 'stocks', 'forex'];
  const byMarket = {} as Record<MarketType, { total: number; wins: number; losses: number; winRate: number }>;

  for (const m of allMarkets) {
    byMarket[m] = { total: 0, wins: 0, losses: 0, winRate: 0 };
  }

  for (const row of marketResult.rows) {
    const m = row.market_type as MarketType;
    const total = Number(row.total);
    const wins = Number(row.wins);
    const losses = Number(row.losses);
    byMarket[m] = {
      total,
      wins,
      losses,
      winRate: total > 0 ? Math.round((wins / total) * 100) : 0,
    };
  }

  const recentDeals = recentResult.rows.map(mapRowToDeal);

  return { totalDeals, winRate, avgPassRoad, byStrategy, byMarket, recentDeals };
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

export async function getDealComments(dealId: number): Promise<DealComment[]> {
  const result = await pool.query<Record<string, unknown>>(
    `SELECT * FROM deal_comments WHERE deal_id = $1 ORDER BY created_at ASC`,
    [dealId],
  );
  return result.rows.map(mapRowToComment);
}

export async function addDealComment(dealId: number, text: string): Promise<DealComment> {
  const result = await pool.query<Record<string, unknown>>(
    `INSERT INTO deal_comments (deal_id, text) VALUES ($1, $2) RETURNING *`,
    [dealId, text],
  );
  const row = result.rows[0];
  if (!row) throw new Error('addDealComment: no row returned');
  return mapRowToComment(row);
}
