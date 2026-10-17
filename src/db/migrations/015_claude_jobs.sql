-- Durable job queue for Claude calls (SKIP LOCKED). Redis can replace this later if volume grows.
CREATE TABLE IF NOT EXISTS claude_jobs (
  id           BIGSERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id),
  deal_id      INTEGER REFERENCES deals(id) ON DELETE SET NULL,
  job_type     VARCHAR(40) NOT NULL,
  payload      JSONB NOT NULL DEFAULT '{}'::jsonb,
  status       VARCHAR(20) NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'running', 'done', 'failed')),
  attempts     INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  run_after    TIMESTAMPTZ,
  last_error   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at   TIMESTAMPTZ,
  finished_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_claude_jobs_claim
  ON claude_jobs (id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_claude_jobs_deal
  ON claude_jobs (deal_id, job_type)
  WHERE status IN ('pending', 'running');
