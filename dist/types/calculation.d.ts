export interface CalculationResult {
    atr: number;
    atrPercent: number | null;
    rangeReserve: number | null;
    passRoad: number | null;
    entryPrice: number;
    stopLossDefault: number;
    takeProfitDefault: number;
    quantity: number;
    sum: number;
    entryPriceByStop?: number;
    stopLossByStop?: number;
    takeProfitByStop?: number;
    takeProfitByStop2?: number;
    takeProfitByStop3?: number;
    quantityByStop?: number;
    sumByStop?: number;
}
export interface ClaudeCheckResult {
    recommendation: 'take' | 'skip' | 'wait';
    confidence: number;
    reasoning: string;
    reasoningRu?: string;
    warnings: string[];
    warningsRu?: string[];
    checkedAt: Date;
}
export interface ClaudeStatsResult {
    summary: string;
    mistakes: string[];
    improvements: string[];
    analyzedAt: Date;
}
