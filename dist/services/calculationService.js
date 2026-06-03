"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calcAtrZy = calcAtrZy;
exports.computeAtrZy = computeAtrZy;
exports.computePassRoad = computePassRoad;
exports.calculateSetup = calculateSetup;
exports.calculateDeal = calculateDeal;
const formatters_1 = require("../utils/formatters");
const ATR_PERIOD = 7;
const SPIKE_MULT = 3.0;
// ── ATR ZY ───────────────────────────────────────────────────────────────────
function calcTrueRange(bars) {
    const tr = [];
    for (let i = 1; i < bars.length; i++) {
        const curr = bars[i];
        const prev = bars[i - 1];
        if (!curr || !prev)
            continue;
        const high = curr[2];
        const low = curr[3];
        const prevClose = prev[4];
        tr.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
    }
    return tr;
}
function calcRMA(values, period) {
    const alpha = 1 / period;
    const rma = [];
    // Seed with SMA of first `period` values
    let sum = 0;
    for (let i = 0; i < period; i++) {
        sum += values[i] ?? 0;
    }
    rma.push(sum / period);
    for (let i = period; i < values.length; i++) {
        const val = values[i] ?? 0;
        rma.push(alpha * val + (1 - alpha) * (rma[rma.length - 1] ?? 0));
    }
    return rma;
}
/**
 * ATR ZY: Wilder RMA as spike reference → skip abnormal bars (carry-forward) → final RMA.
 *
 * Matches PineScript logic: `filteredTR := isSpike ? filteredTR[1] : tr`
 * Spike  (too large): tr > wilderATR * SPIKE_MULT
 * Tiny   (too small): tr < wilderATR / SPIKE_MULT
 * Abnormal bars are fully excluded — previous valid TR is carried forward.
 */
function calcAtrZy(bars) {
    if (bars.length < ATR_PERIOD + 2) {
        throw new Error(`Not enough bars for ATR calculation (need ${ATR_PERIOD + 2}, got ${bars.length})`);
    }
    const tr = calcTrueRange(bars);
    // Step 1: Wilder ATR as spike/tiny threshold reference
    const wilderRma = calcRMA(tr, ATR_PERIOD);
    // Step 2: skip abnormal bars — carry forward last valid TR (PineScript: filteredTR[1])
    const filteredTr = [];
    for (let i = 0; i < tr.length; i++) {
        const raw = tr[i] ?? 0;
        // wilderRma is shorter by (ATR_PERIOD - 1) elements relative to tr
        const wilderIdx = i - (ATR_PERIOD - 1);
        const atrRef = wilderIdx >= 0 ? (wilderRma[wilderIdx] ?? 0) : 0;
        const isSpike = atrRef > 0 && raw > atrRef * SPIKE_MULT;
        const isTiny = atrRef > 0 && raw < atrRef / SPIKE_MULT;
        if ((isSpike || isTiny) && filteredTr.length > 0) {
            filteredTr.push(filteredTr[filteredTr.length - 1] ?? raw);
        }
        else {
            filteredTr.push(raw);
        }
    }
    // Step 3: final ATR from filtered TR using RMA
    const finalRma = calcRMA(filteredTr, ATR_PERIOD);
    return finalRma[finalRma.length - 1] ?? 0;
}
// ── ATR / passRoad helpers (exported for use in handlers) ────────────────────
/** Computes ATR ZY from bars. Returns `{ atr }` for easy destructuring. */
function computeAtrZy(bars) {
    return { atr: calcAtrZy(bars) };
}
/**
 * Computes passRoad (% of ATR consumed by current/last bar body).
 * Uses currentBar if provided (today's forming candle), otherwise falls back to last closed bar.
 */
function computePassRoad(bars, atr, currentBar) {
    const n = bars.length;
    const bar = currentBar ?? bars[n - 1];
    if (!bar || atr <= 0)
        return null;
    return (0, formatters_1.round2)((Math.abs(bar[4] - bar[1]) / atr) * 100);
}
/**
 * Pure calculation: ATR and passRoad are provided directly (e.g. from TradingView Extension).
 * No market data fetch — just computes TP/SL/Qty/rangeReserve.
 */
function calculateSetup(params) {
    const { atr, passRoad, direction, entryRaw, openPrice, riskPercent, ratio, luftPercent, riskSum, customStop } = params;
    const price = entryRaw;
    const isLong = direction === 'long';
    const rangeReserve = openPrice != null
        ? (0, formatters_1.round2)(isLong ? openPrice + 0.8 * atr : openPrice - 0.8 * atr)
        : null;
    const riskDefault = atr * (riskPercent / 100);
    const luft = riskDefault * (luftPercent / 100);
    const entryPrice = (0, formatters_1.round2)(isLong ? price + luft : price - luft);
    const stopLossDefault = (0, formatters_1.round2)(isLong ? entryPrice - riskDefault : entryPrice + riskDefault);
    const takeProfitDefault = (0, formatters_1.round2)(isLong ? entryPrice + ratio * riskDefault : entryPrice - ratio * riskDefault);
    const quantity = (0, formatters_1.round2)(riskSum / riskDefault);
    const sum = (0, formatters_1.round2)(quantity * entryPrice);
    const result = {
        atr: (0, formatters_1.round2)(atr),
        rangeReserve: rangeReserve ?? (0, formatters_1.round2)(price),
        passRoad,
        entryPrice,
        stopLossDefault,
        takeProfitDefault,
        quantity,
        sum,
    };
    if (customStop !== undefined) {
        const riskByStop = Math.abs(price - customStop);
        const luftByStop = riskByStop * (luftPercent / 100);
        const entryPriceByStop = (0, formatters_1.round2)(isLong ? price + luftByStop : price - luftByStop);
        const stopLossByStop = (0, formatters_1.round2)(isLong ? entryPriceByStop - riskByStop : entryPriceByStop + riskByStop);
        const takeProfitByStop = (0, formatters_1.round2)(isLong ? entryPriceByStop + ratio * riskByStop : entryPriceByStop - ratio * riskByStop);
        const takeProfitByStop2 = (0, formatters_1.round2)(isLong ? entryPriceByStop + (ratio + 1) * riskByStop : entryPriceByStop - (ratio + 1) * riskByStop);
        const takeProfitByStop3 = (0, formatters_1.round2)(isLong ? entryPriceByStop + (ratio + 2) * riskByStop : entryPriceByStop - (ratio + 2) * riskByStop);
        const quantityByStop = (0, formatters_1.round2)(riskSum / riskByStop);
        const sumByStop = (0, formatters_1.round2)(quantityByStop * entryPriceByStop);
        result.entryPriceByStop = entryPriceByStop;
        result.stopLossByStop = stopLossByStop;
        result.takeProfitByStop = takeProfitByStop;
        result.takeProfitByStop2 = takeProfitByStop2;
        result.takeProfitByStop3 = takeProfitByStop3;
        result.quantityByStop = quantityByStop;
        result.sumByStop = sumByStop;
    }
    return result;
}
/**
 * Convenience wrapper: computes ATR and passRoad from bars, then calls calculateSetup.
 */
function calculateDeal(params) {
    const { direction, entryRaw, riskPercent, ratio, luftPercent, riskSum, customStop, bars, currentBar } = params;
    const n = bars.length;
    const atr = calcAtrZy(bars);
    const passRoad = computePassRoad(bars, atr, currentBar);
    return calculateSetup({
        atr,
        passRoad,
        direction,
        entryRaw,
        openPrice: bars[n - 1]?.[1],
        riskPercent,
        ratio,
        luftPercent,
        riskSum,
        customStop,
    });
}
//# sourceMappingURL=calculationService.js.map