export interface ClaudeCheckResult {
  recommendation: 'take' | 'skip' | 'wait';
  confidence: number;
  reasoning: string;
  reasoningRu?: string;
  warnings: string[];
  warningsRu?: string[];
  checkedAt: Date;
}

export interface ClaudeStatsResult {
  summary: string;
  summaryRu: string;
  mistakes: string[];
  mistakesRu: string[];
  improvements: string[];
  improvementsRu: string[];
  analyzedAt: Date;
}
