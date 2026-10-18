import type { AnalysisMetrics } from '../analytics/types';
import type { Deal } from '../deals/types';
import * as claudeService from './claudeService';
import type { ClaudeCheckResult, ClaudeStatsResult } from './types';

/** Params for setup check — kept aligned with claudeService.checkSetup */
export type CheckSetupParams = Parameters<typeof claudeService.checkSetup>[0];

/**
 * AI boundary for business code. Swap ClaudeProvider later (LiteLLM, mocks)
 * without touching deals / telegram / worker call sites.
 */
export interface AiProvider {
  checkSetup(params: CheckSetupParams): Promise<ClaudeCheckResult>;
  analyzeClosedDeal(deal: Deal): Promise<ClaudeStatsResult>;
  generateAnalysisReport(params: {
    periodFrom: string;
    periodTo: string;
    metrics: AnalysisMetrics;
    userId?: number;
  }): Promise<{ summary: string; contentHtml: string }>;
}

/** First implementation: direct Anthropic SDK via claudeService ($0 extra). */
export const claudeProvider: AiProvider = {
  checkSetup: (params) => claudeService.checkSetup(params),
  analyzeClosedDeal: (deal) => claudeService.analyzeClosedDeal(deal),
  generateAnalysisReport: (params) => claudeService.generateAnalysisReport(params),
};

let active: AiProvider = claudeProvider;

export function getAiProvider(): AiProvider {
  return active;
}

/** Tests / future LiteLLM wiring */
export function setAiProvider(provider: AiProvider): void {
  active = provider;
}
