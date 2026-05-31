// [timestamp, open, high, low, close, volume]
export type OhlcvBar = [number, number, number, number, number, number];

export interface MarketData {
  bars: OhlcvBar[];
  openBar: OhlcvBar;
}
