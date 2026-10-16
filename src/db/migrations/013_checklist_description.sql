-- Optional explanation of a checklist item for Claude prompts (and the settings UI).
-- Empty = Claude sees only the short label, as before.
ALTER TABLE checklist_items
  ADD COLUMN IF NOT EXISTS description TEXT;
