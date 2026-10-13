import type { FastifyRequest, FastifyReply } from 'fastify';
import * as dashboardService from '../dashboardService';
import * as analysisReportService from '../analysisReportService';

export async function getDashboardHandler(
  _request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const [stats, latestAnalysis] = await Promise.all([
    dashboardService.getDashboardStats(),
    analysisReportService.getLatestReport(),
  ]);
  reply.send({ success: true, stats, latestAnalysis });
}
