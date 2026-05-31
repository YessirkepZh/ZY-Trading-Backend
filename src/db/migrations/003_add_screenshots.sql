ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS screenshot_setup  TEXT,
  ADD COLUMN IF NOT EXISTS screenshot_entry  TEXT,
  ADD COLUMN IF NOT EXISTS screenshot_close  TEXT;
