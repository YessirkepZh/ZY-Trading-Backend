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
