-- Dynamic per-user strategies + risk presets (forked from templates on user create).
-- Risk fields are market-agnostic (work for crypto/stocks/forex and future bonds/commodities).
-- Soft-delete only: archived_at. System rows: no hard delete, system strategy names not renamable.

CREATE TABLE IF NOT EXISTS risk_preset_templates (
  id            SERIAL PRIMARY KEY,
  name          VARCHAR(80) NOT NULL UNIQUE,
  risk_percent  NUMERIC(8,2) NOT NULL,
  ratio         NUMERIC(8,2) NOT NULL,
  luft_percent  NUMERIC(8,2) NOT NULL,
  risk_sum      NUMERIC(12,2) NOT NULL,
  is_default    BOOLEAN NOT NULL DEFAULT FALSE,
  position      INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS strategy_templates (
  id                              SERIAL PRIMARY KEY,
  name                            VARCHAR(80) NOT NULL UNIQUE,
  slug                            VARCHAR(80) NOT NULL UNIQUE,
  position                        INTEGER NOT NULL DEFAULT 0,
  default_risk_preset_template_id INTEGER REFERENCES risk_preset_templates(id),
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO risk_preset_templates (name, risk_percent, ratio, luft_percent, risk_sum, is_default, position)
VALUES ('Default', 15, 3, 20, 15, TRUE, 0)
ON CONFLICT (name) DO NOTHING;

INSERT INTO strategy_templates (name, slug, position, default_risk_preset_template_id)
SELECT v.name, v.slug, v.position, (SELECT id FROM risk_preset_templates WHERE name = 'Default' LIMIT 1)
FROM (VALUES
  ('Пробой', 'proboy', 0),
  ('Ложный Пробой', 'lozhnyy_proboy', 1),
  ('Отбой', 'otboy', 2)
) AS v(name, slug, position)
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS risk_presets (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          VARCHAR(80) NOT NULL,
  risk_percent  NUMERIC(8,2) NOT NULL,
  ratio         NUMERIC(8,2) NOT NULL,
  luft_percent  NUMERIC(8,2) NOT NULL,
  risk_sum      NUMERIC(12,2) NOT NULL,
  is_system     BOOLEAN NOT NULL DEFAULT FALSE,
  is_default    BOOLEAN NOT NULL DEFAULT FALSE,
  template_id   INTEGER REFERENCES risk_preset_templates(id) ON DELETE SET NULL,
  archived_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_risk_presets_user_name_active
  ON risk_presets (user_id, name)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_risk_presets_user
  ON risk_presets (user_id)
  WHERE archived_at IS NULL;

CREATE TABLE IF NOT EXISTS strategies (
  id                     SERIAL PRIMARY KEY,
  user_id                INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name                   VARCHAR(80) NOT NULL,
  slug                   VARCHAR(80) NOT NULL,
  position               INTEGER NOT NULL DEFAULT 0,
  is_system              BOOLEAN NOT NULL DEFAULT FALSE,
  default_risk_preset_id INTEGER REFERENCES risk_presets(id) ON DELETE SET NULL,
  template_id            INTEGER REFERENCES strategy_templates(id) ON DELETE SET NULL,
  archived_at            TIMESTAMPTZ,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_strategies_user_name_active
  ON strategies (user_id, name)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_strategies_user
  ON strategies (user_id)
  WHERE archived_at IS NULL;

ALTER TABLE checklist_groups
  ADD COLUMN IF NOT EXISTS user_id INTEGER REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE checklist_groups
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE checklist_groups
  ADD COLUMN IF NOT EXISTS strategy_id INTEGER REFERENCES strategies(id) ON DELETE SET NULL;

ALTER TABLE checklist_groups DROP CONSTRAINT IF EXISTS checklist_groups_name_key;

CREATE UNIQUE INDEX IF NOT EXISTS idx_checklist_groups_system_name
  ON checklist_groups (name)
  WHERE user_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_checklist_groups_user_name_active
  ON checklist_groups (user_id, name)
  WHERE user_id IS NOT NULL AND archived_at IS NULL;

-- Backfill forks for existing users
DO $$
DECLARE
  u RECORD;
  def_tpl_id INTEGER;
  preset_id INTEGER;
  st RECORD;
BEGIN
  SELECT id INTO def_tpl_id FROM risk_preset_templates WHERE name = 'Default' LIMIT 1;

  FOR u IN SELECT id FROM users LOOP
    IF NOT EXISTS (
      SELECT 1 FROM risk_presets WHERE user_id = u.id AND archived_at IS NULL
    ) THEN
      INSERT INTO risk_presets (user_id, name, risk_percent, ratio, luft_percent, risk_sum, is_system, is_default, template_id)
      SELECT u.id, t.name, t.risk_percent, t.ratio, t.luft_percent, t.risk_sum, TRUE, t.is_default, t.id
      FROM risk_preset_templates t
      ORDER BY t.position, t.id;
    END IF;

    SELECT id INTO preset_id FROM risk_presets
    WHERE user_id = u.id AND archived_at IS NULL
    ORDER BY is_default DESC, id ASC LIMIT 1;

    FOR st IN SELECT * FROM strategy_templates ORDER BY position, id LOOP
      IF NOT EXISTS (
        SELECT 1 FROM strategies
        WHERE user_id = u.id AND name = st.name AND archived_at IS NULL
      ) THEN
        INSERT INTO strategies (user_id, name, slug, position, is_system, default_risk_preset_id, template_id)
        VALUES (u.id, st.name, st.slug, st.position, TRUE, preset_id, st.id);
      END IF;
    END LOOP;
  END LOOP;
END $$;
