import { pool } from '../../db/pool';
import type { AnalysisReport } from './types';

function mapRow(row: Record<string, unknown>, includeHtml = false): AnalysisReport {
  return {
    id:          row['id'] as number,
    periodFrom:  row['period_from'] as string,
    periodTo:    row['period_to'] as string,
    dealsCount:  row['deals_count'] as number,
    metrics:     row['metrics'] as AnalysisReport['metrics'],
    summary:     row['summary'] as string,
    contentHtml: includeHtml ? (row['content_html'] as string) : '',
    createdAt:   row['created_at'] as string,
  };
}

export async function saveReport(params: {
  periodFrom:  string;
  periodTo:    string;
  dealsCount:  number;
  metrics:     object;
  contentHtml: string;
  summary:     string;
}): Promise<number> {
  const result = await pool.query<{ id: number }>(`
    INSERT INTO analysis_reports
      (period_from, period_to, deals_count, metrics, content_html, summary)
    VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING id
  `, [
    params.periodFrom,
    params.periodTo,
    params.dealsCount,
    JSON.stringify(params.metrics),
    params.contentHtml,
    params.summary,
  ]);
  const row = result.rows[0];
  if (!row) throw new Error('saveReport: no row returned');
  return row.id;
}

export async function getReports(limit = 20): Promise<AnalysisReport[]> {
  const { rows } = await pool.query<Record<string, unknown>>(`
    SELECT id, period_from, period_to, deals_count,
           metrics, summary, created_at
    FROM analysis_reports
    ORDER BY created_at DESC
    LIMIT $1
  `, [limit]);

  return rows.map(row => mapRow(row));
}

export async function getReportById(id: number): Promise<AnalysisReport | null> {
  const { rows } = await pool.query<Record<string, unknown>>(`
    SELECT * FROM analysis_reports WHERE id = $1
  `, [id]);
  return rows[0] ? mapRow(rows[0], true) : null;
}

export async function getLatestReport(): Promise<AnalysisReport | null> {
  const { rows } = await pool.query<Record<string, unknown>>(`
    SELECT id, period_from, period_to, deals_count,
           metrics, summary, created_at
    FROM analysis_reports
    ORDER BY created_at DESC LIMIT 1
  `);
  return rows[0] ? mapRow(rows[0], false) : null;
}
