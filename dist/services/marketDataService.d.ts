import type { MarketType } from '../types/deal';
import type { MarketData, OhlcvBar } from '../types/market';
export declare function getMarketData(symbol: string, marketType: MarketType): Promise<MarketData>;
/**
 * Formats the last N bars as a human-readable summary for Claude.
 */
export declare function formatOhlcvSummary(bars: OhlcvBar[], count?: number): string;
