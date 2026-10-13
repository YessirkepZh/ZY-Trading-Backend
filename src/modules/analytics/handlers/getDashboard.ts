import type { FastifyRequest, FastifyReply } from 'fastify';
import { currentUser } from '../../auth';
import * as dashboardService from '../dashboardService';
import * as analysisReportService from '../analysisReportService';

export async function getDashboardHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const userId = currentUser(request).id;
  const [stats, latestAnalysis] = await Promise.all([
    dashboardService.getDashboardStats(userId),
    analysisReportService.getLatestReport(userId),
  ]);
  reply.send({ success: true, stats, latestAnalysis });
}
