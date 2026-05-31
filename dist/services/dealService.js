"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDeal = createDeal;
exports.updateDealStatus = updateDealStatus;
exports.setClaudeCheck = setClaudeCheck;
exports.closeDeal = closeDeal;
exports.setScreenshot = setScreenshot;
exports.setClaudeStats = setClaudeStats;
exports.getDealById = getDealById;
exports.getDeals = getDeals;
exports.checkDuplicate = checkDuplicate;
exports.getDashboardStats = getDashboardStats;
const pool_1 = require("../db/pool");
// ── Row mapper ────────────────────────────────────────────────────────────────
function mapRowToDeal(row) {
    return {
        id: row['id'],
        ticker: row['ticker'],
        marketType: row['market_type'],
        strategy: row['strategy'],
        direction: row['direction'],
        entryRaw: Number(row['entry_raw']),
        status: row['status'],
        payload: row['payload'] ?? {},
        calcResult: row['calc_result'] ?? {},
        claudeCheckResult: row['claude_check_result'],
        checklistSnapshot: row['checklist_snapshot'],
        hasDeal: Boolean(row['has_deal']),
        dealResult: row['deal_result'],
        closePrice: row['close_price'] != null ? Number(row['close_price']) : undefined,
        closedAt: row['closed_at'] != null ? new Date(row['closed_at']) : undefined,
        claudeStatsResult: row['claude_stats_result'],
        screenshotSetup: row['screenshot_setup'],
        screenshotEntry: row['screenshot_entry'],
        screenshotClose: row['screenshot_close'],
        createdAt: new Date(row['created_at']),
        updatedAt: new Date(row['updated_at']),
    };
}
// ── CRUD ──────────────────────────────────────────────────────────────────────
async function createDeal(payload, calcResult) {
    const result = await pool_1.pool.query(`INSERT INTO deals
       (ticker, market_type, strategy, direction, entry_raw, status, payload, calc_result,
        checklist_snapshot, pass_road, atr)
     VALUES ($1,$2,$3,$4,$5,'created',$6,$7,$8,$9,$10)
     RETURNING id`, [
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
    ]);
    const row = result.rows[0];
    if (!row)
        throw new Error('createDeal: no row returned');
    return row.id;
}
async function updateDealStatus(id, status, extra = {}) {
    const updates = ['status = $2', 'updated_at = NOW()'];
    const values = [id, status];
    if (extra.hasDeal !== undefined) {
        values.push(extra.hasDeal);
        updates.push(`has_deal = $${values.length}`);
    }
    await pool_1.pool.query(`UPDATE deals SET ${updates.join(', ')} WHERE id = $1`, values);
}
async function setClaudeCheck(id, result) {
    await pool_1.pool.query(`UPDATE deals SET claude_check_result = $2, updated_at = NOW() WHERE id = $1`, [id, JSON.stringify(result)]);
}
async function closeDeal(id, closePrice, dealResult) {
    await pool_1.pool.query(`UPDATE deals
     SET status = 'closed', close_price = $2, deal_result = $3,
         closed_at = NOW(), has_deal = TRUE, updated_at = NOW()
     WHERE id = $1`, [id, closePrice, dealResult]);
}
async function setScreenshot(id, type, url) {
    const column = `screenshot_${type}`;
    await pool_1.pool.query(`UPDATE deals SET ${column} = $1, updated_at = NOW() WHERE id = $2`, [url, id]);
}
async function setClaudeStats(id, result) {
    await pool_1.pool.query(`UPDATE deals SET claude_stats_result = $2, updated_at = NOW() WHERE id = $1`, [id, JSON.stringify(result)]);
}
async function getDealById(id) {
    const result = await pool_1.pool.query('SELECT * FROM deals WHERE id = $1', [id]);
    const row = result.rows[0];
    return row ? mapRowToDeal(row) : null;
}
async function getDeals(filters = {}) {
    const { status, strategy, limit = 20, offset = 0 } = filters;
    const conditions = [];
    const values = [];
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
    const result = await pool_1.pool.query(`SELECT * FROM deals ${where} ORDER BY created_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`, values);
    return result.rows.map(mapRowToDeal);
}
async function checkDuplicate(ticker, entryRaw, direction) {
    const result = await pool_1.pool.query(`SELECT COUNT(*) as count FROM deals
     WHERE ticker = $1 AND entry_raw = $2 AND direction = $3
       AND created_at > NOW() - INTERVAL '30 seconds'`, [ticker, entryRaw, direction]);
    const row = result.rows[0];
    return Number(row?.count ?? 0) > 0;
}
// ── Dashboard ─────────────────────────────────────────────────────────────────
async function getDashboardStats() {
    const [totalResult, stratResult, passRoadResult, recentResult] = await Promise.all([
        pool_1.pool.query(`SELECT COUNT(*) as total,
              COUNT(*) FILTER (WHERE deal_result = 'win') as wins
       FROM deals WHERE has_deal = true`),
        pool_1.pool.query(`SELECT strategy,
              COUNT(*) as total,
              COUNT(*) FILTER (WHERE deal_result = 'win') as wins
       FROM deals WHERE has_deal = true
       GROUP BY strategy`),
        pool_1.pool.query(`SELECT AVG(pass_road) as avg_pass_road
       FROM deals WHERE has_deal = true AND deal_result = 'win' AND pass_road IS NOT NULL`),
        pool_1.pool.query(`SELECT * FROM deals ORDER BY created_at DESC LIMIT 10`),
    ]);
    const totalRow = totalResult.rows[0];
    const totalDeals = Number(totalRow?.total ?? 0);
    const totalWins = Number(totalRow?.wins ?? 0);
    const winRate = totalDeals > 0 ? Math.round((totalWins / totalDeals) * 100) : 0;
    const avgPassRoadRow = passRoadResult.rows[0];
    const avgPassRoad = Math.round(Number(avgPassRoadRow?.avg_pass_road ?? 0));
    const allStrategies = ['Пробой', 'Ложный Пробой', 'Отбой'];
    const byStrategy = {};
    for (const s of allStrategies) {
        byStrategy[s] = { total: 0, wins: 0, winRate: 0 };
    }
    for (const row of stratResult.rows) {
        const s = row.strategy;
        const total = Number(row.total);
        const wins = Number(row.wins);
        byStrategy[s] = {
            total,
            wins,
            winRate: total > 0 ? Math.round((wins / total) * 100) : 0,
        };
    }
    const recentDeals = recentResult.rows.map(mapRowToDeal);
    return { totalDeals, winRate, avgPassRoad, byStrategy, recentDeals };
}
//# sourceMappingURL=dealService.js.map