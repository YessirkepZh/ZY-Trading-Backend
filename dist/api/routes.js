"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerRoutes = registerRoutes;
const createNote_1 = require("./handlers/createNote");
const updateDeal_1 = require("./handlers/updateDeal");
const getDeals_1 = require("./handlers/getDeals");
const getDealById_1 = require("./handlers/getDealById");
const getDashboard_1 = require("./handlers/getDashboard");
const sendAlert_1 = require("./handlers/sendAlert");
const uploadScreenshot_1 = require("./handlers/uploadScreenshot");
const createAnalysis_1 = require("./handlers/createAnalysis");
const getAnalysisReports_1 = require("./handlers/getAnalysisReports");
async function registerRoutes(fastify) {
    // Error handler
    fastify.setErrorHandler((error, _request, reply) => {
        fastify.log.error(error);
        reply.status(error.statusCode ?? 500).send({
            success: false,
            error: error.message,
        });
    });
    // Health check
    fastify.get('/api/health', async (_request, reply) => {
        reply.send({
            status: 'ok',
            uptime: Math.floor(process.uptime()),
            timestamp: new Date().toISOString(),
        });
    });
    fastify.post('/api/createNote', createNote_1.createNoteHandler);
    fastify.post('/api/updateDeal', updateDeal_1.updateDealHandler);
    fastify.get('/api/deals', getDeals_1.getDealsHandler);
    fastify.get('/api/deals/:id', getDealById_1.getDealByIdHandler);
    fastify.get('/api/dashboard', getDashboard_1.getDashboardHandler);
    fastify.post('/api/sendAlert', sendAlert_1.sendAlertHandler);
    fastify.post('/api/uploadScreenshot', uploadScreenshot_1.uploadScreenshotHandler);
    fastify.post('/api/analysis', { config: { timeout: 60000 } }, createAnalysis_1.createAnalysisHandler);
    fastify.get('/api/analysis', getAnalysisReports_1.getAnalysisReportsHandler);
    fastify.get('/api/analysis/latest', getAnalysisReports_1.getLatestAnalysisHandler);
    fastify.get('/api/analysis/:id', getAnalysisReports_1.getAnalysisReportByIdHandler);
}
//# sourceMappingURL=routes.js.map