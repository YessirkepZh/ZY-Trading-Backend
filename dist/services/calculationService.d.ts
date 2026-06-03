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
export interface SetupParams {
    atr: number;
    passRoad: number | null;
    direction: Direction;
    entryRaw: number;
    /** Open price of the last closed bar — used for rangeReserve */
    openPrice?: number;
    riskPercent: number;
    ratio: number;
    luftPercent: number;
    riskSum: number;
    customStop?: number;
}
/**
 * Pure calculation: ATR and passRoad are provided directly (e.g. from TradingView Extension).
 * No market data fetch — just computes TP/SL/Qty/rangeReserve.
 */
export declare function calculateSetup(params: SetupParams): CalculationResult;
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
/**
 * Convenience wrapper: computes ATR and passRoad from bars, then calls calculateSetup.
 */
export declare function calculateDeal(params: CalcParams): CalculationResult;
