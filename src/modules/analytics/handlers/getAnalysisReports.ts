import type { FastifyRequest, FastifyReply } from 'fastify';
import { currentUser } from '../../auth';
import * as analysisReportService from '../analysisReportService';

export async function getAnalysisReportsHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const reports = await analysisReportService.getReports(currentUser(request).id);
  reply.send({ success: true, reports });
}

export async function getAnalysisReportByIdHandler(
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
): Promise<void> {
  const id = parseInt(request.params.id, 10);
  if (isNaN(id)) {
    reply.status(400).send({ success: false, error: 'Invalid id' });
    return;
  }
  const report = await analysisReportService.getReportById(currentUser(request).id, id);
  if (!report) {
    reply.status(404).send({ success: false, error: `Report #${id} not found` });
    return;
  }
  reply.send({ success: true, report });
}

export async function getLatestAnalysisHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const report = await analysisReportService.getLatestReport(currentUser(request).id);
  if (!report) {
    reply.status(404).send({ success: false, error: 'No analysis reports found' });
    return;
  }
  reply.send({ success: true, report });
}
