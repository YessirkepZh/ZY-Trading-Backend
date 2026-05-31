"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fastify_1 = __importDefault(require("fastify"));
const config_1 = require("./config");
const routes_1 = require("./api/routes");
const handlers_1 = require("./bot/handlers");
const pool_1 = require("./db/pool");
const fastify = (0, fastify_1.default)({
    bodyLimit: 10 * 1024 * 1024, // 10MB for base64 screenshots
    logger: {
        level: config_1.config.nodeEnv === 'production' ? 'info' : 'debug',
    },
});
async function main() {
    // Verify DB connection
    await pool_1.pool.query('SELECT 1');
    fastify.log.info('DB connected');
    // Register all API routes
    await (0, routes_1.registerRoutes)(fastify);
    // Start Telegram Bot (polling)
    (0, handlers_1.initBot)();
    // Start HTTP server
    await fastify.listen({ port: config_1.config.port, host: '0.0.0.0' });
    fastify.log.info(`Server listening on port ${config_1.config.port}`);
}
main().catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
});
//# sourceMappingURL=index.js.map