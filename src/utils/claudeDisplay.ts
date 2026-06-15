import type { ClaudeCheckResult } from '../types/calculation';

const RECOMMENDATION_RU: Record<ClaudeCheckResult['recommendation'], string> = {
  take: 'Входить',
  skip: 'Пропустить',
  wait: 'Ждать',
};

export function formatClaudeRecommendationRu(
  recommendation: ClaudeCheckResult['recommendation'],
): string {
  return RECOMMENDATION_RU[recommendation];
}

export function formatClaudeReasoningRu(claudeCheck: ClaudeCheckResult): string {
  return claudeCheck.reasoningRu ?? claudeCheck.reasoning;
}
