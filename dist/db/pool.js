"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pool = void 0;
const pg_1 = require("pg");
const config_1 = require("../config");
exports.pool = new pg_1.Pool({
    connectionString: config_1.config.db.connectionString,
});
exports.pool.on('error', (err) => {
    console.error('Unexpected DB pool error:', err);
});
//# sourceMappingURL=pool.js.map