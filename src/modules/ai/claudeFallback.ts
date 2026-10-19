import type { ClaudeCheckResult } from './types';

/** Stub check when Claude is skipped (quota / hard failure). */
export function unavailableClaudeCheck(reasonRu: string, reasonEn?: string): ClaudeCheckResult {
  return {
    recommendation: 'wait',
    confidence: 0,
    reasoning: reasonEn ?? reasonRu,
    reasoningRu: reasonRu,
    warnings: ['Claude check skipped'],
    warningsRu: [reasonRu],
    checkedAt: new Date(),
  };
}
