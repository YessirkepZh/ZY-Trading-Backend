export interface ClaudeCheckResult {
  recommendation: 'take' | 'skip' | 'wait';
  confidence: number;
  reasoning: string;
  reasoningRu?: string;
  warnings: string[];
  warningsRu?: string[];
  checkedAt: Date;
}

/** One TradingView chart from the screenshot layout, as reported by the extension */
export interface ChartPane {
  symbol: string;
  /** TradingView resolution: "5", "60", "1D", "1W" */
  interval: string;
  /** Trade levels are drawn on this pane */
  annotated: boolean;
  /** The entry timeframe: full markup and a separate close-up image */
  entry: boolean;
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
