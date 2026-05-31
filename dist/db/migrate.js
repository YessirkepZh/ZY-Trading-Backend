"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = require("fs");
const path_1 = require("path");
const pool_1 = require("./pool");
const migrations = [
    '001_create_deals.sql',
    '002_create_checklist_snapshots.sql',
];
async function migrate() {
    console.log('Running migrations...');
    for (const file of migrations) {
        const sql = (0, fs_1.readFileSync)((0, path_1.join)(__dirname, 'migrations', file), 'utf-8');
        await pool_1.pool.query(sql);
        console.log(`✓ ${file}`);
    }
    console.log('Migrations complete.');
    await pool_1.pool.end();
}
migrate().catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
});
//# sourceMappingURL=migrate.js.map