export type MarketType = 'crypto' | 'stocks' | 'forex';
export type Direction = 'long' | 'short';
export type Strategy = 'Пробой' | 'Ложный Пробой' | 'Отбой';

export interface ChecklistSnapshot {
  plus: string[];
  minus: string[];
  wait: string[];
}
