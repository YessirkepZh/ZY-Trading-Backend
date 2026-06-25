import type { CalculationResult, ClaudeCheckResult, ClaudeStatsResult } from './calculation';

export type DealStatus = 'created' | 'notified' | 'entered' | 'closed' | 'missed';
export type MarketType = 'crypto' | 'stocks' | 'forex';
export type Direction = 'long' | 'short';
export type Strategy = 'Пробой' | 'Ложный Пробой' | 'Отбой';

export interface ChecklistSnapshot {
  plus: string[];
  minus: string[];
  wait: string[];
}

export interface DealPayload {
  ticker: string;
  marketType: MarketType;
  strategy: Strategy;
  direction: Direction;
  entryRaw: number;
  customStop?: number;
  riskPercent: number;
  ratio: number;
  luftPercent: number;
  riskSum: number;
  checklist?: ChecklistSnapshot;
}

export interface Deal {
  id: number;
  ticker: string;
  marketType: MarketType;
  strategy: Strategy;
  direction: Direction;
  entryRaw: number;
  status: DealStatus;
  payload: DealPayload;
  calcResult: CalculationResult;
  claudeCheckResult?: ClaudeCheckResult;
  checklistSnapshot?: ChecklistSnapshot;
  hasDeal: boolean;
  dealResult?: 'win' | 'loss' | 'breakeven';
  closePrice?: number;
  closedAt?: Date;
  claudeStatsResult?: ClaudeStatsResult;
  screenshotSetup?: string;
  screenshotEntry?: string;
  screenshotClose?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MarketStats {
  total: number;
  wins: number;
  losses: number;
  winRate: number;
}

export interface StrategyStats {
  total: number;
  wins: number;
  losses: number;
  winRate: number;
  avgRatio: number;
  avgR: number;
  edgePlanned: number;
  edgeReal: number;
}

export interface WeeklyPerformancePoint {
  period: string;
  weekStart: string;
  total: number;
  wins: number;
  losses: number;
  winRate: number | null;
  avgR: number | null;
}

export interface DailyCount {
  date: string;
  count: number;
}

export interface DailyProfit {
  date: string;
  profitR: number;
  profitUsd: number;
}

export interface DailyDrawdown {
  date: string;
  drawdownR: number;
  drawdownUsd: number;
}

export interface ChecklistStatItem {
  key: string;
  label: string;
  type: 'plus' | 'minus' | 'wait';
  strategy: Strategy;
  inWins: number;
  inLosses: number;
  total: number;
}

export interface DealComment {
  id: number;
  dealId: number;
  text: string;
  createdAt: Date;
}

export interface DashboardStats {
  totalDeals: number;
  winRate: number;
  avgPassRoad: number;
  expectancyR: number;
  expectancyUsd: number;
  maxDrawdownR: number;
  maxDrawdownUsd: number;
  avgDealsPerDay: number;
  byStrategy: Record<Strategy, StrategyStats>;
  byMarket: Record<MarketType, MarketStats>;
  weeklyPerformance: WeeklyPerformancePoint[];
  dealsPerDay: DailyCount[];
  profitSumDaily: DailyProfit[];
  dailyDrawdown: DailyDrawdown[];
  topChecklistInWins: ChecklistStatItem[];
  topChecklistInLoss: ChecklistStatItem[];
  recentDeals: Deal[];
}
