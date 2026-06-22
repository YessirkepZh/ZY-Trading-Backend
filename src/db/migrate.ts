import { readFileSync } from 'fs';
import { join } from 'path';
import { pool } from './pool';

const migrations = [
  '001_create_deals.sql',
  '002_create_checklist_snapshots.sql',
  '003_add_screenshots.sql',
  '004_add_analysis_reports.sql',
  '005_add_entered_at.sql',
  '006_create_checklist_items.sql',
  '007_add_checklist_groups.sql',
];

async function migrate(): Promise<void> {
  console.log('Running migrations...');
  for (const file of migrations) {
    const sql = readFileSync(join(__dirname, 'migrations', file), 'utf-8');
    await pool.query(sql);
    console.log(`✓ ${file}`);
  }
  console.log('Migrations complete.');
  await pool.end();
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
