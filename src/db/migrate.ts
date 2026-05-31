import { readFileSync } from 'fs';
import { join } from 'path';
import { pool } from './pool';

const migrations = [
  '001_create_deals.sql',
  '002_create_checklist_snapshots.sql',
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
