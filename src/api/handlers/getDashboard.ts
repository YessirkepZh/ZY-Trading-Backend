import type { FastifyRequest, FastifyReply } from 'fastify';
import * as dealService from '../../services/dealService';
import * as analysisReportService from '../../services/analysisReportService';

export async function getDashboardHandler(
  _request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const [stats, latestAnalysis] = await Promise.all([
    dealService.getDashboardStats(),
    analysisReportService.getLatestReport(),
  ]);
  reply.send({ success: true, stats, latestAnalysis });
}
