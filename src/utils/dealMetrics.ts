import { getLabelByKey } from '../services/checklistItemService';
import { round2 } from './formatters';
import type { CalculationResult } from '../types/calculation';
import type {
  ChecklistStatItem,
  DailyCount,
  DailyDrawdown,
  DailyProfit,
  DashboardStats,
  DealPayload,
  Direction,
  MarketType,
  Strategy,
  WeeklyPerformancePoint,
} from '../types/deal';

const MIN_WEEKLY_DEALS = 3;
const MIN_CHECKLIST_TOTAL = 3;
const TOP_CHECKLIST_LIMIT = 10;

export interface ClosedDealRow {
  id: number;
  strategy: Strategy;
  marketType: MarketType;
  direction: Direction;
  dealResult?: 'win' | 'loss' | 'breakeven';
  closePrice?: number;
  calcResult: CalculationResult;
  payload: DealPayload;
  passRoad?: number;
  closedAt: Date;
}

export function toDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function getIsoWeekInfo(date: Date): { period: string; weekStart: string } {
  const utc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const year = utc.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const weekNo = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  const period = `${year}-W${String(weekNo).padStart(2, '0')}`;

  const weekStartDate = new Date(date);
  const dayOfWeek = weekStartDate.getDay();
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  weekStartDate.setDate(weekStartDate.getDate() + diff);

  return { period, weekStart: toDateKey(weekStartDate) };
}

export function calcDealR(deal: ClosedDealRow): number | null {
  if (deal.closePrice == null) return null;
  const { entryPrice, stopLossDefault } = deal.calcResult;
  if (!entryPrice || !stopLossDefault) return null;

  const risk = Math.abs(entryPrice - stopLossDefault);
  if (risk === 0) return null;

  const pnl = deal.direction === 'long'
    ? deal.closePrice - entryPrice
    : entryPrice - deal.closePrice;

  return round2(pnl / risk);
}

export function getRiskSum(deal: ClosedDealRow): number {
  return deal.payload.riskSum ?? 15;
}

function winRatePercent(wins: number, losses: number): number {
  const total = wins + losses;
  return total > 0 ? Math.round((wins / total) * 100) : 0;
}

function avgRatio(deals: ClosedDealRow[]): number {
  if (deals.length === 0) return 0;
  const sum = deals.reduce((acc, d) => acc + (d.payload.ratio ?? 3), 0);
  return round2(sum / deals.length);
}

function avgRValues(deals: ClosedDealRow[]): number[] {
  return deals
    .map(calcDealR)
    .filter((r): r is number => r !== null);
}

function computeExpectancy(deals: ClosedDealRow[]): { expectancyR: number; expectancyUsd: number } {
  const wins = deals.filter((d) => d.dealResult === 'win');
  const losses = deals.filter((d) => d.dealResult === 'loss');
  const decisive = wins.length + losses.length;

  if (decisive === 0) {
    return { expectancyR: 0, expectancyUsd: 0 };
  }

  const winRate = wins.length / decisive;
  const lossRate = losses.length / decisive;

  const winRs = avgRValues(wins);
  const lossRs = avgRValues(losses);

  const avgWinR = winRs.length > 0 ? winRs.reduce((a, b) => a + b, 0) / winRs.length : 0;
  const avgLossR = lossRs.length > 0
    ? Math.abs(lossRs.reduce((a, b) => a + b, 0) / lossRs.length)
    : 0;

  const expectancyR = round2(avgWinR * winRate - avgLossR * lossRate);

  const avgRiskSum = deals.length > 0
    ? deals.reduce((acc, d) => acc + getRiskSum(d), 0) / deals.length
    : 0;

  return {
    expectancyR,
    expectancyUsd: round2(expectancyR * avgRiskSum),
  };
}

function computeDrawdowns(deals: ClosedDealRow[]): {
  maxDrawdownR: number;
  maxDrawdownUsd: number;
  profitSumDaily: DailyProfit[];
  dailyDrawdown: DailyDrawdown[];
} {
  const dailyProfitMap = new Map<string, { profitR: number; profitUsd: number }>();

  let cumR = 0;
  let cumUsd = 0;
  let peakR = 0;
  let peakUsd = 0;
  let maxDrawdownR = 0;
  let maxDrawdownUsd = 0;

  const dailyEndDrawdown = new Map<string, { drawdownR: number; drawdownUsd: number }>();

  for (const deal of deals) {
    const r = calcDealR(deal);
    const profitR = r ?? 0;
    const profitUsd = round2(profitR * getRiskSum(deal));
    const date = toDateKey(deal.closedAt);

    const day = dailyProfitMap.get(date) ?? { profitR: 0, profitUsd: 0 };
    day.profitR = round2(day.profitR + profitR);
    day.profitUsd = round2(day.profitUsd + profitUsd);
    dailyProfitMap.set(date, day);

    cumR = round2(cumR + profitR);
    cumUsd = round2(cumUsd + profitUsd);

    peakR = Math.max(peakR, cumR);
    peakUsd = Math.max(peakUsd, cumUsd);

    const ddR = round2(cumR - peakR);
    const ddUsd = round2(cumUsd - peakUsd);

    maxDrawdownR = Math.min(maxDrawdownR, ddR);
    maxDrawdownUsd = Math.min(maxDrawdownUsd, ddUsd);

    dailyEndDrawdown.set(date, { drawdownR: ddR, drawdownUsd: ddUsd });
  }

  const profitSumDaily = [...dailyProfitMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, profitR: v.profitR, profitUsd: v.profitUsd }));

  const dailyDrawdown = [...dailyEndDrawdown.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, drawdownR: v.drawdownR, drawdownUsd: v.drawdownUsd }));

  return { maxDrawdownR, maxDrawdownUsd, profitSumDaily, dailyDrawdown };
}

function computeWeeklyPerformance(deals: ClosedDealRow[]): WeeklyPerformancePoint[] {
  const weekMap = new Map<string, {
    weekStart: string;
    deals: ClosedDealRow[];
  }>();

  for (const deal of deals) {
    const { period, weekStart } = getIsoWeekInfo(deal.closedAt);
    const entry = weekMap.get(period) ?? { weekStart, deals: [] };
    entry.deals.push(deal);
    weekMap.set(period, entry);
  }

  return [...weekMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([period, { weekStart, deals: weekDeals }]) => {
      const wins = weekDeals.filter((d) => d.dealResult === 'win').length;
      const losses = weekDeals.filter((d) => d.dealResult === 'loss').length;
      const decisive = wins + losses;
      const rs = avgRValues(weekDeals);
      const avgR = rs.length > 0 ? round2(rs.reduce((a, b) => a + b, 0) / rs.length) : null;

      return {
        period,
        weekStart,
        total: weekDeals.length,
        wins,
        losses,
        winRate: weekDeals.length >= MIN_WEEKLY_DEALS && decisive > 0
          ? winRatePercent(wins, losses)
          : null,
        avgR: weekDeals.length >= MIN_WEEKLY_DEALS ? avgR : null,
      };
    });
}

function computeDealsPerDay(deals: ClosedDealRow[]): { dealsPerDay: DailyCount[]; avgDealsPerDay: number } {
  const dayMap = new Map<string, number>();

  for (const deal of deals) {
    const date = toDateKey(deal.closedAt);
    dayMap.set(date, (dayMap.get(date) ?? 0) + 1);
  }

  const dealsPerDay = [...dayMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));

  const avgDealsPerDay = dayMap.size > 0
    ? round2(deals.length / dayMap.size)
    : 0;

  return { dealsPerDay, avgDealsPerDay };
}

function buildStrategyStats(deals: ClosedDealRow[]): DashboardStats['byStrategy'] {
  const allStrategies: Strategy[] = ['Пробой', 'Ложный Пробой', 'Отбой'];
  const result = {} as DashboardStats['byStrategy'];

  for (const s of allStrategies) {
    const group = deals.filter((d) => d.strategy === s);
    const wins = group.filter((d) => d.dealResult === 'win').length;
    const losses = group.filter((d) => d.dealResult === 'loss').length;
    const decisive = wins + losses;
    const rs = avgRValues(group);
    const avgR = rs.length > 0 ? round2(rs.reduce((a, b) => a + b, 0) / rs.length) : 0;
    const ratio = avgRatio(group);
    const wr = decisive > 0 ? wins / decisive : 0;

    result[s] = {
      total: group.length,
      wins,
      losses,
      winRate: winRatePercent(wins, losses),
      avgRatio: ratio,
      avgR,
      edgePlanned: round2(wr * ratio - (1 - wr)),
      edgeReal: avgR,
    };
  }

  return result;
}

function buildMarketStats(deals: ClosedDealRow[]): DashboardStats['byMarket'] {
  const allMarkets: MarketType[] = ['crypto', 'stocks', 'forex'];
  const result = {} as DashboardStats['byMarket'];

  for (const m of allMarkets) {
    const group = deals.filter((d) => d.marketType === m);
    const wins = group.filter((d) => d.dealResult === 'win').length;
    const losses = group.filter((d) => d.dealResult === 'loss').length;

    result[m] = {
      total: group.length,
      wins,
      losses,
      winRate: winRatePercent(wins, losses),
    };
  }

  return result;
}

export function buildChecklistTop(
  rows: Array<{
    item_key: string;
    item_type: string;
    strategy: string;
    in_wins: string;
    in_losses: string;
    total: string;
  }>,
  sortBy: 'wins' | 'losses',
): ChecklistStatItem[] {
  const sorted = [...rows].sort((a, b) => {
    const aVal = sortBy === 'wins' ? Number(a.in_wins) : Number(a.in_losses);
    const bVal = sortBy === 'wins' ? Number(b.in_wins) : Number(b.in_losses);
    return bVal - aVal;
  });

  return sorted.slice(0, TOP_CHECKLIST_LIMIT).map((row) => ({
    key: row.item_key,
    label: getLabelByKey(row.strategy as Strategy, row.item_key),
    type: row.item_type as ChecklistStatItem['type'],
    strategy: row.strategy as Strategy,
    inWins: Number(row.in_wins),
    inLosses: Number(row.in_losses),
    total: Number(row.total),
  }));
}

export function computeDashboardFromClosedDeals(
  deals: ClosedDealRow[],
  checklistRows: Array<{
    item_key: string;
    item_type: string;
    strategy: string;
    in_wins: string;
    in_losses: string;
    total: string;
  }>,
): Omit<DashboardStats, 'recentDeals'> {
  const wins = deals.filter((d) => d.dealResult === 'win').length;
  const losses = deals.filter((d) => d.dealResult === 'loss').length;

  const winDeals = deals.filter((d) => d.dealResult === 'win' && d.passRoad != null);
  const avgPassRoad = winDeals.length > 0
    ? Math.round(winDeals.reduce((acc, d) => acc + (d.passRoad ?? 0), 0) / winDeals.length)
    : 0;

  const { expectancyR, expectancyUsd } = computeExpectancy(deals);
  const { maxDrawdownR, maxDrawdownUsd, profitSumDaily, dailyDrawdown } = computeDrawdowns(deals);
  const { dealsPerDay, avgDealsPerDay } = computeDealsPerDay(deals);

  return {
    totalDeals: deals.length,
    winRate: winRatePercent(wins, losses),
    avgPassRoad,
    expectancyR,
    expectancyUsd,
    maxDrawdownR,
    maxDrawdownUsd,
    avgDealsPerDay,
    byStrategy: buildStrategyStats(deals),
    byMarket: buildMarketStats(deals),
    weeklyPerformance: computeWeeklyPerformance(deals),
    dealsPerDay,
    profitSumDaily,
    dailyDrawdown,
    topChecklistInWins: buildChecklistTop(checklistRows, 'wins'),
    topChecklistInLoss: buildChecklistTop(checklistRows, 'losses'),
  };
}

export const CHECKLIST_STATS_QUERY = `
  SELECT cs.item_key, cs.item_type, cs.strategy,
         COUNT(*) FILTER (WHERE cs.deal_result = 'win')  AS in_wins,
         COUNT(*) FILTER (WHERE cs.deal_result = 'loss') AS in_losses,
         COUNT(*) AS total
  FROM checklist_stats cs
  INNER JOIN deals d ON d.id = cs.deal_id
  WHERE d.status = 'closed' AND d.closed_at IS NOT NULL
  GROUP BY cs.item_key, cs.item_type, cs.strategy
  HAVING COUNT(*) >= ${MIN_CHECKLIST_TOTAL}
`;

export const CLOSED_DEALS_QUERY = `
  SELECT id, strategy, market_type, direction, deal_result, close_price,
         calc_result, payload, pass_road, closed_at
  FROM deals
  WHERE status = 'closed' AND closed_at IS NOT NULL
  ORDER BY closed_at ASC
`;
