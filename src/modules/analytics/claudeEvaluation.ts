import { round2 } from '../../shared/formatters';
import type { ClaudeCheckResult } from '../ai';
import type { ClosedDealRow } from './dealMetrics';

export type ClaudeRecommendation = ClaudeCheckResult['recommendation'];

export interface ClaudeEvalByRec {
  recommendation: ClaudeRecommendation;
  count: number;
  wins: number;
  losses: number;
  winRate: number;
  avgConfidence: number;
}

export interface ClaudeConfidenceBucket {
  label: string;
  min: number;
  max: number;
  count: number;
  wins: number;
  winRate: number;
  avgConfidence: number;
}

/** One point on claimed-confidence vs actual win-rate curve (take only) */
export interface CalibrationPoint {
  label: string;
  claimedConfidence: number;
  actualWinRate: number;
  count: number;
  /** actualWinRate − claimedConfidence; negative = overconfident */
  delta: number;
}

/**
 * How well checkSetup recommendations match closed win/loss outcomes.
 * wait is shown in byRecommendation but excluded from accuracyPercent
 * (it does not strongly predict win or loss).
 */
export interface ClaudeEvaluation {
  evaluatedDeals: number;
  /** (take∩win + skip∩loss) / (take + skip); null when neither take nor skip has samples */
  accuracyPercent: number | null;
  byRecommendation: ClaudeEvalByRec[];
  /** Actual win rate of take calls, grouped by stated confidence */
  confidenceBuckets: ClaudeConfidenceBucket[];
  /** Curve points for charts (same buckets) */
  calibrationCurve: CalibrationPoint[];
  /**
   * Expected Calibration Error in percentage points (0 = perfect).
   * Weighted mean |actualWinRate − avgConfidence| over take buckets.
   */
  expectedCalibrationError: number | null;
}

const REC_ORDER: ClaudeRecommendation[] = ['take', 'skip', 'wait'];

const CONFIDENCE_BUCKETS: Array<{ label: string; min: number; max: number }> = [
  { label: '0–59', min: 0, max: 59 },
  { label: '60–69', min: 60, max: 69 },
  { label: '70–79', min: 70, max: 79 },
  { label: '80–89', min: 80, max: 89 },
  { label: '90–100', min: 90, max: 100 },
];

interface EvalDeal {
  recommendation: ClaudeRecommendation;
  confidence: number;
  dealResult: 'win' | 'loss';
}

function extractEvalDeals(deals: ClosedDealRow[]): EvalDeal[] {
  const out: EvalDeal[] = [];
  for (const d of deals) {
    if (d.dealResult !== 'win' && d.dealResult !== 'loss') continue;
    const check = d.claudeCheckResult;
    if (!check) continue;
    const rec = check.recommendation;
    if (rec !== 'take' && rec !== 'skip' && rec !== 'wait') continue;
    const confidence = Number(check.confidence);
    if (!Number.isFinite(confidence)) continue;
    out.push({
      recommendation: rec,
      confidence: Math.max(0, Math.min(100, confidence)),
      dealResult: d.dealResult,
    });
  }
  return out;
}

function winRatePercent(wins: number, losses: number): number {
  const total = wins + losses;
  return total > 0 ? Math.round((wins / total) * 100) : 0;
}

export function computeClaudeEvaluation(deals: ClosedDealRow[]): ClaudeEvaluation | null {
  const evaluated = extractEvalDeals(deals);
  if (evaluated.length === 0) return null;

  const byRecommendation: ClaudeEvalByRec[] = REC_ORDER.map((recommendation) => {
    const rows = evaluated.filter((d) => d.recommendation === recommendation);
    const wins = rows.filter((d) => d.dealResult === 'win').length;
    const losses = rows.filter((d) => d.dealResult === 'loss').length;
    const avgConfidence = rows.length > 0
      ? round2(rows.reduce((s, d) => s + d.confidence, 0) / rows.length)
      : 0;
    return {
      recommendation,
      count: rows.length,
      wins,
      losses,
      winRate: winRatePercent(wins, losses),
      avgConfidence,
    };
  }).filter((r) => r.count > 0);

  const takeOrSkip = evaluated.filter((d) => d.recommendation === 'take' || d.recommendation === 'skip');
  let accuracyPercent: number | null = null;
  if (takeOrSkip.length > 0) {
    const correct = takeOrSkip.filter((d) =>
      (d.recommendation === 'take' && d.dealResult === 'win')
      || (d.recommendation === 'skip' && d.dealResult === 'loss'),
    ).length;
    accuracyPercent = Math.round((correct / takeOrSkip.length) * 100);
  }

  const takes = evaluated.filter((d) => d.recommendation === 'take');
  const confidenceBuckets: ClaudeConfidenceBucket[] = CONFIDENCE_BUCKETS
    .map((b) => {
      const rows = takes.filter((d) => d.confidence >= b.min && d.confidence <= b.max);
      const wins = rows.filter((d) => d.dealResult === 'win').length;
      const losses = rows.filter((d) => d.dealResult === 'loss').length;
      return {
        label: b.label,
        min: b.min,
        max: b.max,
        count: rows.length,
        wins,
        winRate: winRatePercent(wins, losses),
        avgConfidence: rows.length > 0
          ? round2(rows.reduce((s, d) => s + d.confidence, 0) / rows.length)
          : 0,
      };
    })
    .filter((b) => b.count > 0);

  const calibrationCurve: CalibrationPoint[] = confidenceBuckets.map((b) => ({
    label: b.label,
    claimedConfidence: b.avgConfidence,
    actualWinRate: b.winRate,
    count: b.count,
    delta: round2(b.winRate - b.avgConfidence),
  }));

  let expectedCalibrationError: number | null = null;
  const takeN = confidenceBuckets.reduce((s, b) => s + b.count, 0);
  if (takeN > 0) {
    const ece = confidenceBuckets.reduce(
      (s, b) => s + (b.count / takeN) * Math.abs(b.winRate - b.avgConfidence),
      0,
    );
    expectedCalibrationError = round2(ece);
  }

  return {
    evaluatedDeals: evaluated.length,
    accuracyPercent,
    byRecommendation,
    confidenceBuckets,
    calibrationCurve,
    expectedCalibrationError,
  };
}
