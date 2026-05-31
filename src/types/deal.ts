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
  createdAt: Date;
  updatedAt: Date;
}

export interface DashboardStats {
  totalDeals: number;
  winRate: number;
  avgPassRoad: number;
  byStrategy: Record<Strategy, { total: number; wins: number; winRate: number }>;
  recentDeals: Deal[];
}
