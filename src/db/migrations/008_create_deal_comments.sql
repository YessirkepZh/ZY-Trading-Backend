CREATE TABLE IF NOT EXISTS deal_comments (
  id         SERIAL PRIMARY KEY,
  deal_id    INTEGER NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  text       TEXT NOT NULL CHECK (char_length(text) >= 1 AND char_length(text) <= 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deal_comments_deal_id ON deal_comments(deal_id);
