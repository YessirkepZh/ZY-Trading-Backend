import type { Deal, DealPayload, DealStatus, DashboardStats, Strategy } from '../types/deal';
import type { CalculationResult, ClaudeCheckResult, ClaudeStatsResult } from '../types/calculation';
export declare function createDeal(payload: DealPayload, calcResult: CalculationResult): Promise<number>;
export declare function updateDealStatus(id: number, status: DealStatus, extra?: Partial<Pick<Deal, 'hasDeal'>>): Promise<void>;
export declare function setClaudeCheck(id: number, result: ClaudeCheckResult): Promise<void>;
export declare function closeDeal(id: number, closePrice: number, dealResult: 'win' | 'loss' | 'breakeven'): Promise<void>;
export declare function setScreenshot(id: number, type: 'setup' | 'entry' | 'close', url: string): Promise<void>;
export declare function setClaudeStats(id: number, result: ClaudeStatsResult): Promise<void>;
export declare function getDealById(id: number): Promise<Deal | null>;
export declare function getDeals(filters?: {
    status?: DealStatus;
    strategy?: Strategy;
    limit?: number;
    offset?: number;
}): Promise<Deal[]>;
export declare function checkDuplicate(ticker: string, entryRaw: number, direction: string): Promise<boolean>;
export declare function getDashboardStats(): Promise<DashboardStats>;
