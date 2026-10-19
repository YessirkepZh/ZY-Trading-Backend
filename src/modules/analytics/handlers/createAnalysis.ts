import type { FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { config } from '../../../config';
import {
  AiQuotaExceededError,
  BurstLimitExceededError,
  assertBurstLimit,
  claudeJobService,
} from '../../ai';
import { currentUser } from '../../auth';
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
    const userId = currentUser(request).id;

    try {
      assertBurstLimit(
        `analysis:${userId}`,
        config.aiQuota.burstPerMinute,
        60_000,
      );
    } catch (err) {
      if (err instanceof BurstLimitExceededError) {
        reply.status(429).send({ success: false, error: err.message, code: err.code });
        return;
      }
      throw err;
    }

    const { metrics } = await analyticsService.computeMetrics(userId, periodFrom, periodTo);

    if (metrics.closedDeals < 3) {
      reply.status(400).send({
        success: false,
        error: 'Недостаточно закрытых сделок для анализа (минимум 3)',
      });
      return;
    }

    const id = await analysisReportService.saveReport({
      userId,
      periodFrom, periodTo,
      dealsCount: metrics.closedDeals,
      metrics,
      contentHtml: '<p style="color:#888">Отчёт генерируется…</p>',
      summary: analysisReportService.PENDING_REPORT_SUMMARY,
    });

    try {
      await claudeJobService.enqueueJob({
        userId,
        jobType: 'analysis_report',
        payload: { reportId: id, periodFrom, periodTo, metrics },
      });
    } catch (err) {
      if (err instanceof AiQuotaExceededError) {
        await analysisReportService.updateReportContent(id, userId, {
          summary: 'Лимит AI',
          contentHtml: `<p style="color:#f44336">${err.message}</p>`,
        });
        reply.status(429).send({
          success: false,
          error: err.message,
          code: err.code,
          id,
        });
        return;
      }
      throw err;
    }

    reply.send({
      success: true,
      id,
      summary: analysisReportService.PENDING_REPORT_SUMMARY,
      metrics,
      pending: true,
    });

  } catch (err) {
    request.log.error({ err }, 'createAnalysis failed');
    reply.status(500).send({
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}
