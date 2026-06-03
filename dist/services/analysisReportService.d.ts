import type { AnalysisReport } from '../types/analysis';
export declare function saveReport(params: {
    periodFrom: string;
    periodTo: string;
    dealsCount: number;
    metrics: object;
    contentHtml: string;
    summary: string;
}): Promise<number>;
export declare function getReports(limit?: number): Promise<AnalysisReport[]>;
export declare function getReportById(id: number): Promise<AnalysisReport | null>;
export declare function getLatestReport(): Promise<AnalysisReport | null>;
