import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { claudeService } from '../../ai';
import * as analyticsService from '../analyticsService';
import * as analysisReportService from '../analysisReportService';

const CreateAnalysisSchema = z.object({
  periodFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodTo:   z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export async function createAnalysisHandler(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  try {
    const parsed = CreateAnalysisSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.status(400).send({ success: false, error: parsed.error.flatten() });
      return;
    }

    const { periodFrom, periodTo } = parsed.data;

    const { metrics } = await analyticsService.computeMetrics(periodFrom, periodTo);

    if (metrics.closedDeals < 3) {
      reply.status(400).send({
        success: false,
        error: 'Недостаточно закрытых сделок для анализа (минимум 3)',
      });
      return;
    }

    const { summary, contentHtml } = await claudeService.generateAnalysisReport({
      periodFrom, periodTo, metrics,
    });

    const id = await analysisReportService.saveReport({
      periodFrom, periodTo,
      dealsCount: metrics.closedDeals,
      metrics,
      contentHtml,
      summary,
    });

    reply.send({ success: true, id, summary, metrics });

  } catch (err) {
    request.log.error({ err }, 'createAnalysis failed');
    reply.status(500).send({
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}
