import { marketDataService } from '../market';
import type { OhlcvBar } from '../market';
import * as calculationService from './calculationService';
import type { PreviewSetupInput } from './schemas';
import type { CalculationResult } from './types';

/** Input the trader can fix; the message is shown as-is in the extension */
export class SetupValidationError extends Error {}

// Protects from an ATR copied from the wrong timeframe (M5 instead of D1)
const ATR_LIMITS: Record<string, { min: number; max: number }> = {
  stocks: { min: 0.3,  max: 8   },
  crypto: { min: 0.5,  max: 20  },
  forex:  { min: 0.05, max: 2   },
};

function validateAtrOverride(marketType: string, entryRaw: number, atrOverride: number): void {
  const atrPct = (atrOverride / entryRaw) * 100;
  const limits = ATR_LIMITS[marketType] ?? { min: 0.1, max: 20 };

  if (atrPct < limits.min) {
    throw new SetupValidationError(
      `⚠️ ATR слишком маленький (${atrPct.toFixed(3)}% от цены). ` +
      `Возможно взят с M5/M15 вместо D1. ` +
      `Убедись что индикатор ATR ZY открыт на D1 таймфрейме в TradingView.`,
    );
  }

  if (atrPct > limits.max) {
    throw new SetupValidationError(
      `⚠️ ATR слишком большой (${atrPct.toFixed(1)}% от цены). ` +
      `Проверь правильность значения ATR.`,
    );
  }
}

export interface PreparedSetup {
  calcResult: CalculationResult;
  /** Empty when every input came from the chart indicator and no candles were loaded */
  bars: OhlcvBar[];
  atrSource: 'indicator' | 'extension' | 'api';
}

type PreparedSetupInput = PreviewSetupInput & {
  riskPercent: number;
  ratio: number;
  luftPercent: number;
  riskSum: number;
};

/** Validates the trader's input, loads candles when needed and calculates entry/SL/TP */
export async function prepareSetup(input: PreparedSetupInput): Promise<PreparedSetup> {
  const {
    ticker, marketType, direction, entryRaw, customStop,
    riskPercent, ratio, luftPercent, riskSum, atrOverride, passRoadOverride, dayOpen,
  } = input;

  const hasAtrOverride = atrOverride !== undefined && atrOverride > 0;
  if (hasAtrOverride) validateAtrOverride(marketType, entryRaw, atrOverride);

  const setupParams = { direction, entryRaw, riskPercent, ratio, luftPercent, riskSum, customStop };

  // ATR ZY indicator on the chart gives everything the calculation needs — no candle download
  if (hasAtrOverride && passRoadOverride !== undefined && dayOpen !== undefined) {
    const calcResult = calculationService.calculateSetup({
      ...setupParams,
      atr: atrOverride,
      passRoad: passRoadOverride,
      openPrice: dayOpen,
    });
    return { calcResult, bars: [], atrSource: 'indicator' };
  }

  const { bars, currentBar } = await marketDataService.getMarketData(ticker, marketType);

  const atr = hasAtrOverride ? atrOverride : calculationService.computeAtrZy(bars).atr;
  const passRoad = passRoadOverride != null && passRoadOverride > 0
    ? passRoadOverride
    : calculationService.computePassRoad(bars, atr, currentBar);

  const calcResult = calculationService.calculateSetup({
    ...setupParams,
    atr,
    passRoad,
    // Today's open; providers without a forming bar only have the last daily bar
    openPrice: currentBar?.[1] ?? bars[bars.length - 1]?.[1],
  });

  return { calcResult, bars, atrSource: hasAtrOverride ? 'extension' : 'api' };
}
