CREATE TABLE IF NOT EXISTS analysis_reports (
  id            SERIAL PRIMARY KEY,
  period_from   DATE          NOT NULL,
  period_to     DATE          NOT NULL,
  deals_count   INTEGER       NOT NULL DEFAULT 0,
  metrics       JSONB         NOT NULL DEFAULT '{}',
  content_html  TEXT          NOT NULL,
  summary       TEXT          NOT NULL,
  created_at    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analysis_reports_created ON analysis_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analysis_reports_period  ON analysis_reports(period_from, period_to);

ALTER TABLE deals ADD COLUMN IF NOT EXISTS atr_percent NUMERIC;
