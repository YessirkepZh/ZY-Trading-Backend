import { pool } from '../../db/pool';
import { config } from '../../config';
import {
  sendPositionReminder,
  sendSetupAutoMissedNotice,
  sendSetupReminder,
} from '../telegram/telegramService';

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Setup (created/notified): 1h → 4h → 24h → auto-miss at 3d */
const SETUP_STAGE_MS = [HOUR_MS, 4 * HOUR_MS, 24 * HOUR_MS, 3 * DAY_MS] as const;
/** Open position (entered): 1h → 4h → 24h, then stop */
const POSITION_STAGE_MS = [HOUR_MS, 4 * HOUR_MS, 24 * HOUR_MS] as const;

interface ReminderRow {
  id: number;
  user_id: number;
  ticker: string;
  status: 'created' | 'notified' | 'entered';
  remind_count: number;
  created_at: Date | string;
  entered_at: Date | string | null;
}

function asDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

export interface ReminderRunResult {
  reminded: number;
  autoMissed: number;
  skippedNoTelegram: number;
  errors: number;
}

function ageMs(from: Date, now: Date): number {
  return now.getTime() - from.getTime();
}

async function markReminded(id: number, nextCount: number): Promise<void> {
  await pool.query(
    `UPDATE deals
     SET remind_count = $2, last_reminded_at = NOW(), updated_at = NOW()
     WHERE id = $1`,
    [id, nextCount],
  );
}

async function markMissed(id: number): Promise<void> {
  await pool.query(
    `UPDATE deals
     SET status = 'missed',
         remind_count = remind_count + 1,
         last_reminded_at = NOW(),
         updated_at = NOW()
     WHERE id = $1 AND status IN ('created', 'notified')`,
    [id],
  );
}

function dealUrl(id: number): string {
  return `${config.frontendUrl}/deals/${id}`;
}

async function processSetup(row: ReminderRow, now: Date, result: ReminderRunResult): Promise<void> {
  const age = ageMs(asDate(row.created_at), now);
  const autoMissAt = SETUP_STAGE_MS[SETUP_STAGE_MS.length - 1]!;

  try {
    // 3 days without entered/missed → close the loop
    if (age >= autoMissAt) {
      await markMissed(row.id);
      const sent = await sendSetupAutoMissedNotice(row.user_id, {
        id: row.id,
        ticker: row.ticker,
        url: dealUrl(row.id),
      });
      if (!sent) result.skippedNoTelegram += 1;
      result.autoMissed += 1;
      return;
    }

    const next = row.remind_count;
    if (next >= SETUP_STAGE_MS.length - 1) return;
    const threshold = SETUP_STAGE_MS[next];
    if (threshold === undefined || age < threshold) return;

    const sent = await sendSetupReminder(row.user_id, {
      id: row.id,
      ticker: row.ticker,
      stageHours: [1, 4, 24][next] ?? 1,
      url: dealUrl(row.id),
    });
    if (!sent) result.skippedNoTelegram += 1;
    await markReminded(row.id, next + 1);
    result.reminded += 1;
  } catch (err) {
    console.error(`[reminders] setup #${row.id}:`, err);
    result.errors += 1;
  }
}

async function processPosition(row: ReminderRow, now: Date, result: ReminderRunResult): Promise<void> {
  const from = asDate(row.entered_at ?? row.created_at);
  const age = ageMs(from, now);
  const next = row.remind_count;
  if (next >= POSITION_STAGE_MS.length) return;
  const threshold = POSITION_STAGE_MS[next];
  if (threshold === undefined || age < threshold) return;

  try {
    const sent = await sendPositionReminder(row.user_id, {
      id: row.id,
      ticker: row.ticker,
      stageHours: [1, 4, 24][next] ?? 1,
      url: dealUrl(row.id),
    });
    if (!sent) result.skippedNoTelegram += 1;
    await markReminded(row.id, next + 1);
    result.reminded += 1;
  } catch (err) {
    console.error(`[reminders] position #${row.id}:`, err);
    result.errors += 1;
  }
}

export async function runReminders(now = new Date()): Promise<ReminderRunResult> {
  const result: ReminderRunResult = {
    reminded: 0,
    autoMissed: 0,
    skippedNoTelegram: 0,
    errors: 0,
  };

  const setups = await pool.query<ReminderRow>(
    `SELECT id, user_id, ticker, status, remind_count, created_at, entered_at
     FROM deals
     WHERE status IN ('created', 'notified')
     ORDER BY created_at ASC
     LIMIT 100`,
  );

  for (const row of setups.rows) {
    await processSetup(row, now, result);
  }

  const positions = await pool.query<ReminderRow>(
    `SELECT id, user_id, ticker, status, remind_count, created_at, entered_at
     FROM deals
     WHERE status = 'entered'
     ORDER BY COALESCE(entered_at, created_at) ASC
     LIMIT 100`,
  );

  for (const row of positions.rows) {
    await processPosition(row, now, result);
  }

  return result;
}
