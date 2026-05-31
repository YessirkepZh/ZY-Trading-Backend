import type { MarketType, Direction, Strategy } from '../types/deal';
import type { CalculationResult, ClaudeCheckResult, ClaudeStatsResult } from '../types/calculation';
import type { ChecklistSnapshot } from '../types/deal';
import type { Deal } from '../types/deal';
export declare function checkSetup(params: {
    ticker: string;
    marketType: MarketType;
    strategy: Strategy;
    direction: Direction;
    calcResult: CalculationResult;
    checklist: ChecklistSnapshot;
    ohlcvSummary: string;
}): Promise<ClaudeCheckResult>;
export declare function analyzeClosedDeal(deal: Deal): Promise<ClaudeStatsResult>;
