import type { AnalysisMetrics } from '../types/analysis';
export declare function computeMetrics(periodFrom: string, periodTo: string): Promise<{
    metrics: AnalysisMetrics;
    deals: Record<string, unknown>[];
}>;
