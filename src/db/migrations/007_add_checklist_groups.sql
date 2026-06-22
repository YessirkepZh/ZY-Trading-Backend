-- Groups table (represents strategies / логические группы чеклиста)
CREATE TABLE IF NOT EXISTS checklist_groups (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(30) NOT NULL UNIQUE,
  position   INTEGER     NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO checklist_groups (name, position) VALUES
  ('Пробой',       0),
  ('Ложный Пробой', 1),
  ('Отбой',        2)
ON CONFLICT (name) DO NOTHING;

-- Add group_id FK to checklist_items
ALTER TABLE checklist_items
  ADD COLUMN IF NOT EXISTS group_id INTEGER REFERENCES checklist_groups(id);

-- Populate group_id from existing strategy column
UPDATE checklist_items ci
  SET group_id = cg.id
  FROM checklist_groups cg
  WHERE cg.name = ci.strategy
    AND ci.group_id IS NULL;

-- Make group_id required
ALTER TABLE checklist_items
  ALTER COLUMN group_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_checklist_items_group_id ON checklist_items(group_id);
