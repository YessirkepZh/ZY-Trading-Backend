import type { Direction } from '../types/deal';
import type { CalculationResult } from '../types/calculation';
import type { OhlcvBar } from '../types/market';
/**
 * ATR ZY: Wilder RMA as spike reference → skip abnormal bars (carry-forward) → final RMA.
 *
 * Matches PineScript logic: `filteredTR := isSpike ? filteredTR[1] : tr`
 * Spike  (too large): tr > wilderATR * SPIKE_MULT
 * Tiny   (too small): tr < wilderATR / SPIKE_MULT
 * Abnormal bars are fully excluded — previous valid TR is carried forward.
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
    /** Current (potentially unclosed) bar — used for passRoad (PineScript parity) */
    currentBar?: OhlcvBar;
}
export declare function calculateDeal(params: CalcParams): CalculationResult;
