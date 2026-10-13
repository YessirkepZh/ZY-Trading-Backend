CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT,
  role          VARCHAR(10)  NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  telegram_id   BIGINT UNIQUE,
  is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Owner of all pre-existing data. Credentials are set with `npm run setup-owner`
INSERT INTO users (email, role) VALUES ('owner@edgemark.local', 'admin')
ON CONFLICT (email) DO NOTHING;

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash CHAR(64)    NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);

CREATE TABLE IF NOT EXISTS api_tokens (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         VARCHAR(100) NOT NULL,
  token_hash   CHAR(64)     NOT NULL UNIQUE,
  token_prefix VARCHAR(16)  NOT NULL,
  last_used_at TIMESTAMPTZ,
  revoked_at   TIMESTAMPTZ,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_tokens_user ON api_tokens(user_id);

CREATE TABLE IF NOT EXISTS invites (
  id         SERIAL PRIMARY KEY,
  token_hash CHAR(64)     NOT NULL UNIQUE,
  email      VARCHAR(255),
  role       VARCHAR(10)  NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  created_by INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ  NOT NULL,
  used_at    TIMESTAMPTZ,
  used_by    INTEGER      REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Ownership of existing data
ALTER TABLE deals            ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id);
ALTER TABLE checklist_items  ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id);
ALTER TABLE analysis_reports ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id);
ALTER TABLE deal_comments    ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id);

UPDATE deals            SET user_id = (SELECT id FROM users WHERE email = 'owner@edgemark.local') WHERE user_id IS NULL;
UPDATE checklist_items  SET user_id = (SELECT id FROM users WHERE email = 'owner@edgemark.local') WHERE user_id IS NULL;
UPDATE analysis_reports SET user_id = (SELECT id FROM users WHERE email = 'owner@edgemark.local') WHERE user_id IS NULL;
UPDATE deal_comments    SET user_id = (SELECT id FROM users WHERE email = 'owner@edgemark.local') WHERE user_id IS NULL;

ALTER TABLE deals            ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE checklist_items  ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE analysis_reports ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE deal_comments    ALTER COLUMN user_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_deals_user_created     ON deals(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_checklist_items_user   ON checklist_items(user_id);
CREATE INDEX IF NOT EXISTS idx_analysis_reports_user  ON analysis_reports(user_id, created_at DESC);

-- Checklist keys are unique per user now
ALTER TABLE checklist_items DROP CONSTRAINT IF EXISTS checklist_items_strategy_key_key;
ALTER TABLE checklist_items ADD CONSTRAINT checklist_items_user_strategy_key_key UNIQUE (user_id, strategy, key);
