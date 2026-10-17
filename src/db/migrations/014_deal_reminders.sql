-- Reminder state for stuck setups / open positions (Railway cron → /api/internal/reminders)
ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS last_reminded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS remind_count INTEGER NOT NULL DEFAULT 0;

-- One-time cleanup: forgotten setups older than 3 days become missed (no Telegram spam)
UPDATE deals
SET status = 'missed',
    updated_at = NOW()
WHERE status IN ('created', 'notified')
  AND created_at < NOW() - INTERVAL '3 days';
