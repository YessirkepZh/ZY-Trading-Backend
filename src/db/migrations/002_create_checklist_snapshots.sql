CREATE TABLE IF NOT EXISTS checklist_stats (
  id          SERIAL PRIMARY KEY,
  deal_id     INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  strategy    VARCHAR(30) NOT NULL,
  item_key    VARCHAR(60) NOT NULL,
  item_type   VARCHAR(12) NOT NULL CHECK (item_type IN ('plus','minus','wait')),
  deal_result VARCHAR(10),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_checklist_stats_key    ON checklist_stats(item_key);
CREATE INDEX IF NOT EXISTS idx_checklist_stats_result ON checklist_stats(deal_result);
