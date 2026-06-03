import type { MarketType, Direction, Strategy } from '../types/deal';
import type { CalculationResult, ClaudeCheckResult, ClaudeStatsResult } from '../types/calculation';
import type { ChecklistSnapshot } from '../types/deal';
import type { Deal } from '../types/deal';
import type { AnalysisMetrics } from '../types/analysis';
export declare function checkSetup(params: {
    ticker: string;
    marketType: MarketType;
    strategy: Strategy;
    direction: Direction;
    calcResult: CalculationResult;
    checklist: ChecklistSnapshot;
    ohlcvSummary: string;
    screenshotUrl?: string;
}): Promise<ClaudeCheckResult>;
export declare function analyzeClosedDeal(deal: Deal): Promise<ClaudeStatsResult>;
export declare function generateAnalysisReport(params: {
    periodFrom: string;
    periodTo: string;
    metrics: AnalysisMetrics;
}): Promise<{
    summary: string;
    contentHtml: string;
}>;
