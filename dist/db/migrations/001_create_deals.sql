CREATE TABLE IF NOT EXISTS deals (
  id                  SERIAL PRIMARY KEY,
  ticker              VARCHAR(20) NOT NULL,
  market_type         VARCHAR(10) NOT NULL CHECK (market_type IN ('crypto','stocks','forex')),
  strategy            VARCHAR(30) NOT NULL,
  direction           VARCHAR(5)  NOT NULL CHECK (direction IN ('long','short')),
  entry_raw           NUMERIC     NOT NULL,
  status              VARCHAR(15) NOT NULL DEFAULT 'created'
                      CHECK (status IN ('created','notified','entered','closed','missed')),
  payload             JSONB       NOT NULL DEFAULT '{}',
  calc_result         JSONB       NOT NULL DEFAULT '{}',
  claude_check_result JSONB,
  checklist_snapshot  JSONB,
  has_deal            BOOLEAN     NOT NULL DEFAULT FALSE,
  deal_result         VARCHAR(10) CHECK (deal_result IN ('win','loss','breakeven')),
  close_price         NUMERIC,
  closed_at           TIMESTAMPTZ,
  claude_stats_result JSONB,
  pass_road           NUMERIC,
  atr                 NUMERIC,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deals_ticker   ON deals(ticker);
CREATE INDEX IF NOT EXISTS idx_deals_status   ON deals(status);
CREATE INDEX IF NOT EXISTS idx_deals_strategy ON deals(strategy);
CREATE INDEX IF NOT EXISTS idx_deals_created  ON deals(created_at DESC);

-- Deduplication is enforced in application layer (dealService.checkDuplicate)
