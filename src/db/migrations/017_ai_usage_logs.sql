-- Local AI observability ($0 — no LangFuse). Tokens + estimated USD per Claude call.
CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id              BIGSERIAL PRIMARY KEY,
  user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  deal_id         INTEGER REFERENCES deals(id) ON DELETE SET NULL,
  purpose         VARCHAR(40) NOT NULL,
  model           VARCHAR(80) NOT NULL,
  tier            VARCHAR(20) NOT NULL,
  input_tokens    INTEGER NOT NULL DEFAULT 0,
  output_tokens   INTEGER NOT NULL DEFAULT 0,
  cache_creation_input_tokens INTEGER NOT NULL DEFAULT 0,
  cache_read_input_tokens     INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd NUMERIC(12, 6) NOT NULL DEFAULT 0,
  latency_ms      INTEGER,
  ok              BOOLEAN NOT NULL DEFAULT TRUE,
  error           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_user_created
  ON ai_usage_logs (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_purpose_created
  ON ai_usage_logs (purpose, created_at DESC);
