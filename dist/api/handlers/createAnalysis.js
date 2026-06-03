"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAnalysisHandler = createAnalysisHandler;
const zod_1 = require("zod");
const analyticsService = __importStar(require("../../services/analyticsService"));
const claudeService = __importStar(require("../../services/claudeService"));
const analysisReportService = __importStar(require("../../services/analysisReportService"));
const CreateAnalysisSchema = zod_1.z.object({
    periodFrom: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    periodTo: zod_1.z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
async function createAnalysisHandler(request, reply) {
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
    }
    catch (err) {
        request.log.error({ err }, 'createAnalysis failed');
        reply.status(500).send({
            success: false,
            error: err instanceof Error ? err.message : 'Unknown error',
        });
    }
}
//# sourceMappingURL=createAnalysis.js.map