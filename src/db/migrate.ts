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

  // Tracking table — each migration runs exactly once
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name   VARCHAR(255) PRIMARY KEY,
      run_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Bootstrap: if tracking table is empty but the DB already has all
  // migrations applied (detected by group_id column on checklist_items),
  // backfill the tracking table so we don't re-run them.
  const { rows: tracked } = await pool.query<{ count: string }>(
    'SELECT COUNT(*) AS count FROM schema_migrations',
  );

  if (Number(tracked[0]?.count) === 0) {
    const { rows: col } = await pool.query<{ count: string }>(`
      SELECT COUNT(*) AS count
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name   = 'checklist_items'
        AND column_name  = 'group_id'
    `);

    if (Number(col[0]?.count) > 0) {
      for (const file of migrations) {
        await pool.query(
          'INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING',
          [file],
        );
      }
      console.log('Bootstrap: existing DB detected, migration tracking backfilled.');
    }
  }

  // Run only migrations that haven't been recorded yet
  for (const file of migrations) {
    const { rows } = await pool.query<{ name: string }>(
      'SELECT name FROM schema_migrations WHERE name = $1',
      [file],
    );

    if (rows.length > 0) {
      console.log(`○ ${file} (already applied)`);
      continue;
    }

    const sql = readFileSync(join(__dirname, 'migrations', file), 'utf-8');
    await pool.query(sql);
    await pool.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
    console.log(`✓ ${file}`);
  }

  console.log('Migrations complete.');
  await pool.end();
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
