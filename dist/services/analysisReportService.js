"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveReport = saveReport;
exports.getReports = getReports;
exports.getReportById = getReportById;
exports.getLatestReport = getLatestReport;
const pool_1 = require("../db/pool");
function mapRow(row, includeHtml = false) {
    return {
        id: row['id'],
        periodFrom: row['period_from'],
        periodTo: row['period_to'],
        dealsCount: row['deals_count'],
        metrics: row['metrics'],
        summary: row['summary'],
        contentHtml: includeHtml ? row['content_html'] : '',
        createdAt: row['created_at'],
    };
}
async function saveReport(params) {
    const result = await pool_1.pool.query(`
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
    if (!row)
        throw new Error('saveReport: no row returned');
    return row.id;
}
async function getReports(limit = 20) {
    const { rows } = await pool_1.pool.query(`
    SELECT id, period_from, period_to, deals_count,
           metrics, summary, created_at
    FROM analysis_reports
    ORDER BY created_at DESC
    LIMIT $1
  `, [limit]);
    return rows.map(row => mapRow(row));
}
async function getReportById(id) {
    const { rows } = await pool_1.pool.query(`
    SELECT * FROM analysis_reports WHERE id = $1
  `, [id]);
    return rows[0] ? mapRow(rows[0], true) : null;
}
async function getLatestReport() {
    const { rows } = await pool_1.pool.query(`
    SELECT id, period_from, period_to, deals_count,
           metrics, summary, created_at
    FROM analysis_reports
    ORDER BY created_at DESC LIMIT 1
  `);
    return rows[0] ? mapRow(rows[0], false) : null;
}
//# sourceMappingURL=analysisReportService.js.map