import type { Direction } from '../types/deal';
import type { CalculationResult } from '../types/calculation';
import type { OhlcvBar } from '../types/market';
/**
 * ATR ZY: compute Wilder RMA → use as spike threshold → filter TR → final RMA.
 * Returns the final ATR value (last value).
 */
export declare function calcAtrZy(bars: OhlcvBar[]): number;
export interface CalcParams {
    direction: Direction;
    entryRaw: number;
    riskPercent: number;
    ratio: number;
    luftPercent: number;
    riskSum: number;
    customStop?: number;
    bars: OhlcvBar[];
}
export declare function calculateDeal(params: CalcParams): CalculationResult;
