import type { Deal } from '../deals';
import type { MarketType, Strategy } from '../../shared/trading';

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

export interface AnalysisMetrics {
  totalDeals: number;
  closedDeals: number;
  winRate: number;
  winRateChange?: number;

  winRateByPassRoad: {
    '0-20':  { count: number; winRate: number };
    '20-40': { count: number; winRate: number };
    '40-60': { count: number; winRate: number };
    '>60':   { count: number; winRate: number };
  };

  winRateByStrategy: Record<string, {
    total: number;
    wins: number;
    winRate: number;
  }>;

  checklistCorrelation: Array<{
    key: string;
    label: string;
    type: 'plus' | 'minus' | 'wait';
    count: number;
    winRate: number;
  }>;

  winRateByDayOfWeek: Record<string, {
    count: number;
    winRate: number;
  }>;

  winRateByAtrPercent: {
    'low (<1.5%)':     { count: number; winRate: number };
    'medium (1.5-3%)': { count: number; winRate: number };
    'high (>3%)':      { count: number; winRate: number };
  };

  streakAnalysis: {
    afterLoss2plus: { count: number; winRate: number };
    afterWin3plus:  { count: number; winRate: number };
  };

  ratioAnalysis: {
    plannedAvg: number;
    realAvg: number;
  };

  timeToEntryAnalysis: {
    fast:   { label: string; count: number; winRate: number };
    medium: { label: string; count: number; winRate: number };
    slow:   { label: string; count: number; winRate: number };
  };

  bestStrategy:  string;
  worstStrategy: string;
  topMistake:    string;
}

export interface AnalysisReport {
  id: number;
  periodFrom: string;
  periodTo: string;
  dealsCount: number;
  metrics: AnalysisMetrics;
  contentHtml: string;
  summary: string;
  createdAt: string;
}

export interface CreateAnalysisInput {
  periodFrom: string;
  periodTo:   string;
}
