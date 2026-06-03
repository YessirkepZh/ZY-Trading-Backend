export type OhlcvBar = [number, number, number, number, number, number];
export interface MarketData {
    bars: OhlcvBar[];
    openBar: OhlcvBar;
    /** Current (potentially unclosed) bar — used for passRoad calculation */
    currentBar?: OhlcvBar;
}
