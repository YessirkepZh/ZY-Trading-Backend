export type MarketType = 'crypto' | 'stocks' | 'forex';
export type Direction = 'long' | 'short';
/** Strategy name — system defaults + user-defined; stored as text on deals */
export type Strategy = string;

export interface ChecklistSnapshot {
  plus: string[];
  minus: string[];
  wait: string[];
}
