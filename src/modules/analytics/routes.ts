import type { FastifyInstance } from 'fastify';
import { getDashboardHandler } from './handlers/getDashboard';
import { createAnalysisHandler } from './handlers/createAnalysis';
import {
  getAnalysisReportsHandler,
  getAnalysisReportByIdHandler,
  getLatestAnalysisHandler,
} from './handlers/getAnalysisReports';

export function registerAnalyticsRoutes(fastify: FastifyInstance): void {
  fastify.get('/api/dashboard', getDashboardHandler);

  fastify.post('/api/analysis', { config: { timeout: 60000 } }, createAnalysisHandler);
  fastify.get('/api/analysis', getAnalysisReportsHandler);
  fastify.get('/api/analysis/latest', getLatestAnalysisHandler);
  fastify.get<{ Params: { id: string } }>('/api/analysis/:id', getAnalysisReportByIdHandler);
}
