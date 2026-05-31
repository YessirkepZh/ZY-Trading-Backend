import { Pool } from 'pg';
import { config } from '../config';

export const pool = new Pool({
  connectionString: config.db.connectionString,
});

pool.on('error', (err) => {
  console.error('Unexpected DB pool error:', err);
});
