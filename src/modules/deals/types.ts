import type { ClaudeCheckResult, ClaudeStatsResult } from '../ai';
import type { ChecklistSnapshot, Direction, MarketType, Strategy } from '../../shared/trading';

export type DealStatus = 'created' | 'notified' | 'entered' | 'closed' | 'missed';

export interface CalculationResult {
  atr: number;
  atrPercent: number | null;
  rangeReserve: number | null;
  passRoad: number | null;
  entryPrice: number;
  stopLossDefault: number;
  takeProfitDefault: number;
  quantity: number;
  sum: number;
  entryPriceByStop?: number;
  stopLossByStop?: number;
  takeProfitByStop?: number;
  takeProfitByStop2?: number;
  takeProfitByStop3?: number;
  quantityByStop?: number;
  sumByStop?: number;
}

export interface DealPayload {
  ticker: string;
  marketType: MarketType;
  strategy: Strategy;
  direction: Direction;
  entryRaw: number;
  customStop?: number;
  riskPercent: number;
  ratio: number;
  luftPercent: number;
  riskSum: number;
  checklist?: ChecklistSnapshot;
}

export interface Deal {
  id: number;
  userId: number;
  ticker: string;
  marketType: MarketType;
  strategy: Strategy;
  direction: Direction;
  entryRaw: number;
  status: DealStatus;
  payload: DealPayload;
  calcResult: CalculationResult;
  claudeCheckResult?: ClaudeCheckResult;
  checklistSnapshot?: ChecklistSnapshot;
  hasDeal: boolean;
  dealResult?: 'win' | 'loss' | 'breakeven';
  closePrice?: number;
  closedAt?: Date;
  claudeStatsResult?: ClaudeStatsResult;
  screenshotSetup?: string;
  screenshotEntry?: string;
  screenshotClose?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DealComment {
  id: number;
  dealId: number;
  text: string;
  createdAt: Date;
}

export interface DealNotifier {
  notifyNewDeal(
    deal: Deal,
    calcResult: CalculationResult,
    claudeCheck: ClaudeCheckResult,
    checklist: ChecklistSnapshot | undefined,
  ): Promise<void>;
}
