import { pool } from '../../db/pool';
import type { MarketType, Strategy } from '../../shared/trading';
import { dealService, type CalculationResult, type DealPayload } from '../deals';
import {
  CHECKLIST_STATS_QUERY,
  CLOSED_DEALS_QUERY,
  computeDashboardFromClosedDeals,
  type ClosedDealRow,
} from './dealMetrics';
import type { DashboardStats } from './types';

const RECENT_DEALS_LIMIT = 10;

function mapRowToClosedDeal(row: Record<string, unknown>): ClosedDealRow {
  return {
    id: row['id'] as number,
    strategy: row['strategy'] as Strategy,
    marketType: row['market_type'] as MarketType,
    direction: row['direction'] as ClosedDealRow['direction'],
    dealResult: row['deal_result'] as ClosedDealRow['dealResult'],
    closePrice: row['close_price'] != null ? Number(row['close_price']) : undefined,
    actualEntryPrice: row['actual_entry_price'] != null ? Number(row['actual_entry_price']) : undefined,
    calcResult: (row['calc_result'] as CalculationResult) ?? {},
    payload: (row['payload'] as DealPayload) ?? {},
    passRoad: row['pass_road'] != null ? Number(row['pass_road']) : undefined,
    closedAt: new Date(row['closed_at'] as string),
  };
}

export async function getDashboardStats(userId: number): Promise<DashboardStats> {
  const [closedResult, checklistResult, recentDeals] = await Promise.all([
    pool.query<Record<string, unknown>>(CLOSED_DEALS_QUERY, [userId]),
    pool.query<{
      item_key: string;
      item_type: string;
      strategy: string;
      in_wins: string;
      in_losses: string;
      total: string;
    }>(CHECKLIST_STATS_QUERY, [userId]),
    dealService.getDeals(userId, { limit: RECENT_DEALS_LIMIT }),
  ]);

  const closedDeals = closedResult.rows.map(mapRowToClosedDeal);
  const stats = computeDashboardFromClosedDeals(userId, closedDeals, checklistResult.rows);

  return { ...stats, recentDeals };
}
