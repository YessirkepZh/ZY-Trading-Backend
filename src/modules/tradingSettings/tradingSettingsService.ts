import { pool } from '../../db/pool';
import type {
  CreateRiskPresetInput,
  CreateStrategyInput,
  RiskPreset,
  StrategyRow,
  UpdateRiskPresetInput,
  UpdateStrategyInput,
} from './types';

function mapPreset(row: Record<string, unknown>): RiskPreset {
  return {
    id: row['id'] as number,
    userId: row['user_id'] as number,
    name: row['name'] as string,
    riskPercent: Number(row['risk_percent']),
    ratio: Number(row['ratio']),
    luftPercent: Number(row['luft_percent']),
    riskSum: Number(row['risk_sum']),
    isSystem: Boolean(row['is_system']),
    isDefault: Boolean(row['is_default']),
    archivedAt: row['archived_at'] ? new Date(row['archived_at'] as string) : null,
  };
}

function mapStrategy(row: Record<string, unknown>): StrategyRow {
  return {
    id: row['id'] as number,
    userId: row['user_id'] as number,
    name: row['name'] as string,
    slug: row['slug'] as string,
    position: row['position'] as number,
    isSystem: Boolean(row['is_system']),
    defaultRiskPresetId: row['default_risk_preset_id'] != null
      ? Number(row['default_risk_preset_id'])
      : null,
    archivedAt: row['archived_at'] ? new Date(row['archived_at'] as string) : null,
  };
}

function slugify(name: string): string {
  const map: Record<string, string> = {
    а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
    и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
    с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch',
    ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  };
  return name
    .toLowerCase()
    .split('')
    .map((ch) => map[ch] ?? ch)
    .join('')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 80) || 'strategy';
}

/** Fork templates into a new user's private strategies + risk presets. Idempotent. */
export async function forkDefaultsForUser(userId: number): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: existingPresets } = await client.query(
      `SELECT id FROM risk_presets WHERE user_id = $1 AND archived_at IS NULL LIMIT 1`,
      [userId],
    );

    if (existingPresets.length === 0) {
      await client.query(`
        INSERT INTO risk_presets
          (user_id, name, risk_percent, ratio, luft_percent, risk_sum, is_system, is_default, template_id)
        SELECT $1, t.name, t.risk_percent, t.ratio, t.luft_percent, t.risk_sum, TRUE, t.is_default, t.id
        FROM risk_preset_templates t
        ORDER BY t.position, t.id
      `, [userId]);
    }

    const { rows: presetRows } = await client.query(
      `SELECT id FROM risk_presets
       WHERE user_id = $1 AND archived_at IS NULL
       ORDER BY is_default DESC, id ASC LIMIT 1`,
      [userId],
    );
    const presetId = presetRows[0]?.id as number | undefined;
    if (presetId == null) throw new Error('forkDefaultsForUser: no risk preset');

    const { rows: templates } = await client.query<{
      id: number; name: string; slug: string; position: number;
    }>(`SELECT id, name, slug, position FROM strategy_templates ORDER BY position, id`);

    for (const st of templates) {
      await client.query(`
        INSERT INTO strategies
          (user_id, name, slug, position, is_system, default_risk_preset_id, template_id)
        SELECT $1, $2, $3, $4, TRUE, $5, $6
        WHERE NOT EXISTS (
          SELECT 1 FROM strategies
          WHERE user_id = $1 AND name = $2 AND archived_at IS NULL
        )
      `, [userId, st.name, st.slug, st.position, presetId, st.id]);
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

// ── Risk presets ─────────────────────────────────────────────────────────────

export async function listRiskPresets(userId: number, includeArchived = false): Promise<RiskPreset[]> {
  const { rows } = await pool.query(`
    SELECT * FROM risk_presets
    WHERE user_id = $1
      AND ($2::boolean OR archived_at IS NULL)
    ORDER BY is_default DESC, is_system DESC, name
  `, [userId, includeArchived]);
  return rows.map(mapPreset);
}

export async function getRiskPreset(userId: number, id: number): Promise<RiskPreset | null> {
  const { rows } = await pool.query(
    `SELECT * FROM risk_presets WHERE id = $1 AND user_id = $2 AND archived_at IS NULL`,
    [id, userId],
  );
  return rows[0] ? mapPreset(rows[0]) : null;
}

export async function getDefaultRiskPreset(userId: number): Promise<RiskPreset | null> {
  const { rows } = await pool.query(`
    SELECT * FROM risk_presets
    WHERE user_id = $1 AND archived_at IS NULL
    ORDER BY is_default DESC, is_system DESC, id ASC
    LIMIT 1
  `, [userId]);
  return rows[0] ? mapPreset(rows[0]) : null;
}

export async function createRiskPreset(userId: number, input: CreateRiskPresetInput): Promise<RiskPreset> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (input.isDefault) {
      await client.query(
        `UPDATE risk_presets SET is_default = FALSE, updated_at = NOW()
         WHERE user_id = $1 AND archived_at IS NULL`,
        [userId],
      );
    }
    const { rows } = await client.query(`
      INSERT INTO risk_presets
        (user_id, name, risk_percent, ratio, luft_percent, risk_sum, is_system, is_default)
      VALUES ($1, $2, $3, $4, $5, $6, FALSE, $7)
      RETURNING *
    `, [
      userId, input.name.trim(), input.riskPercent, input.ratio,
      input.luftPercent, input.riskSum, Boolean(input.isDefault),
    ]);
    await client.query('COMMIT');
    return mapPreset(rows[0]!);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function updateRiskPreset(
  userId: number,
  id: number,
  input: UpdateRiskPresetInput,
): Promise<RiskPreset> {
  const existing = await getRiskPreset(userId, id);
  if (!existing) throw new Error('Risk preset not found');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (input.isDefault === true) {
      await client.query(
        `UPDATE risk_presets SET is_default = FALSE, updated_at = NOW()
         WHERE user_id = $1 AND archived_at IS NULL AND id <> $2`,
        [userId, id],
      );
    }
    const { rows } = await client.query(`
      UPDATE risk_presets SET
        name = COALESCE($3, name),
        risk_percent = COALESCE($4, risk_percent),
        ratio = COALESCE($5, ratio),
        luft_percent = COALESCE($6, luft_percent),
        risk_sum = COALESCE($7, risk_sum),
        is_default = COALESCE($8, is_default),
        updated_at = NOW()
      WHERE id = $1 AND user_id = $2 AND archived_at IS NULL
      RETURNING *
    `, [
      id, userId,
      input.name?.trim() ?? null,
      input.riskPercent ?? null,
      input.ratio ?? null,
      input.luftPercent ?? null,
      input.riskSum ?? null,
      input.isDefault ?? null,
    ]);
    await client.query('COMMIT');
    if (!rows[0]) throw new Error('Risk preset not found');
    return mapPreset(rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/** Soft-delete. System presets cannot be archived. */
export async function archiveRiskPreset(userId: number, id: number): Promise<void> {
  const existing = await getRiskPreset(userId, id);
  if (!existing) throw new Error('Risk preset not found');
  if (existing.isSystem) throw new Error('System risk preset cannot be archived');

  const { rowCount } = await pool.query(`
    UPDATE risk_presets SET archived_at = NOW(), updated_at = NOW(), is_default = FALSE
    WHERE id = $1 AND user_id = $2 AND archived_at IS NULL
  `, [id, userId]);
  if (!rowCount) throw new Error('Risk preset not found');

  // Clear strategy links
  await pool.query(`
    UPDATE strategies SET default_risk_preset_id = NULL, updated_at = NOW()
    WHERE user_id = $1 AND default_risk_preset_id = $2
  `, [userId, id]);
}

// ── Strategies ───────────────────────────────────────────────────────────────

export async function listStrategies(userId: number, includeArchived = false): Promise<StrategyRow[]> {
  const { rows } = await pool.query(`
    SELECT s.*,
           p.id AS p_id, p.user_id AS p_user_id, p.name AS p_name,
           p.risk_percent AS p_risk_percent, p.ratio AS p_ratio,
           p.luft_percent AS p_luft_percent, p.risk_sum AS p_risk_sum,
           p.is_system AS p_is_system, p.is_default AS p_is_default,
           p.archived_at AS p_archived_at
    FROM strategies s
    LEFT JOIN risk_presets p ON p.id = s.default_risk_preset_id AND p.archived_at IS NULL
    WHERE s.user_id = $1
      AND ($2::boolean OR s.archived_at IS NULL)
    ORDER BY s.position, s.id
  `, [userId, includeArchived]);

  return rows.map((row) => {
    const s = mapStrategy(row);
    if (row['p_id'] != null) {
      s.defaultRiskPreset = mapPreset({
        id: row['p_id'],
        user_id: row['p_user_id'],
        name: row['p_name'],
        risk_percent: row['p_risk_percent'],
        ratio: row['p_ratio'],
        luft_percent: row['p_luft_percent'],
        risk_sum: row['p_risk_sum'],
        is_system: row['p_is_system'],
        is_default: row['p_is_default'],
        archived_at: row['p_archived_at'],
      });
    } else {
      s.defaultRiskPreset = null;
    }
    return s;
  });
}

export async function getStrategyByName(userId: number, name: string): Promise<StrategyRow | null> {
  const { rows } = await pool.query(
    `SELECT * FROM strategies WHERE user_id = $1 AND name = $2 AND archived_at IS NULL`,
    [userId, name],
  );
  return rows[0] ? mapStrategy(rows[0]) : null;
}

export async function createStrategy(userId: number, input: CreateStrategyInput): Promise<StrategyRow> {
  const name = input.name.trim();
  if (!name) throw new Error('Strategy name is required');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const slug = slugify(name);
    const { rows } = await client.query(`
      INSERT INTO strategies
        (user_id, name, slug, position, is_system, default_risk_preset_id)
      VALUES ($1, $2, $3, COALESCE($4, 100), FALSE, $5)
      RETURNING *
    `, [userId, name, slug, input.position ?? null, input.defaultRiskPresetId ?? null]);

    const strategy = mapStrategy(rows[0]!);

    // User-scoped checklist group for custom strategy
    await client.query(`
      INSERT INTO checklist_groups (name, position, user_id, strategy_id)
      SELECT $1, $2, $3, $4
      WHERE NOT EXISTS (
        SELECT 1 FROM checklist_groups
        WHERE user_id = $3 AND name = $1 AND archived_at IS NULL
      )
    `, [name, strategy.position, userId, strategy.id]);

    await client.query('COMMIT');
    return strategy;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function updateStrategy(
  userId: number,
  id: number,
  input: UpdateStrategyInput,
): Promise<StrategyRow> {
  const { rows: existingRows } = await pool.query(
    `SELECT * FROM strategies WHERE id = $1 AND user_id = $2 AND archived_at IS NULL`,
    [id, userId],
  );
  const existing = existingRows[0] ? mapStrategy(existingRows[0]) : null;
  if (!existing) throw new Error('Strategy not found');

  if (input.name !== undefined && existing.isSystem) {
    throw new Error('System strategy cannot be renamed');
  }

  if (input.defaultRiskPresetId != null) {
    const preset = await getRiskPreset(userId, input.defaultRiskPresetId);
    if (!preset) throw new Error('Risk preset not found');
  }

  const { rows } = await pool.query(`
    UPDATE strategies SET
      name = COALESCE($3, name),
      slug = CASE WHEN $3::text IS NOT NULL THEN $4 ELSE slug END,
      default_risk_preset_id = CASE
        WHEN $5::boolean THEN $6
        ELSE default_risk_preset_id
      END,
      position = COALESCE($7, position),
      updated_at = NOW()
    WHERE id = $1 AND user_id = $2 AND archived_at IS NULL
    RETURNING *
  `, [
    id, userId,
    input.name?.trim() ?? null,
    input.name ? slugify(input.name.trim()) : null,
    input.defaultRiskPresetId !== undefined,
    input.defaultRiskPresetId ?? null,
    input.position ?? null,
  ]);
  if (!rows[0]) throw new Error('Strategy not found');
  return mapStrategy(rows[0]);
}

/** Soft-delete. System strategies cannot be archived. Open deals keep payload snapshot. */
export async function archiveStrategy(userId: number, id: number): Promise<void> {
  const { rows } = await pool.query(
    `SELECT * FROM strategies WHERE id = $1 AND user_id = $2 AND archived_at IS NULL`,
    [id, userId],
  );
  if (!rows[0]) throw new Error('Strategy not found');
  if (rows[0]['is_system']) throw new Error('System strategy cannot be archived');

  await pool.query(`
    UPDATE strategies SET archived_at = NOW(), updated_at = NOW()
    WHERE id = $1 AND user_id = $2
  `, [id, userId]);

  await pool.query(`
    UPDATE checklist_groups SET archived_at = NOW(), updated_at = NOW()
    WHERE strategy_id = $1 AND user_id = $2 AND archived_at IS NULL
  `, [id, userId]);
}

/** Resolve risk numbers for a deal: explicit preset → strategy default → user default. */
export async function resolveRiskForDeal(
  userId: number,
  strategyName: string,
  riskPresetId?: number,
): Promise<{ riskPercent: number; ratio: number; luftPercent: number; riskSum: number; presetId: number | null }> {
  if (riskPresetId != null) {
    const preset = await getRiskPreset(userId, riskPresetId);
    if (!preset) throw new Error('Risk preset not found');
    return {
      riskPercent: preset.riskPercent,
      ratio: preset.ratio,
      luftPercent: preset.luftPercent,
      riskSum: preset.riskSum,
      presetId: preset.id,
    };
  }

  const strategy = await getStrategyByName(userId, strategyName);
  if (strategy?.defaultRiskPresetId) {
    const preset = await getRiskPreset(userId, strategy.defaultRiskPresetId);
    if (preset) {
      return {
        riskPercent: preset.riskPercent,
        ratio: preset.ratio,
        luftPercent: preset.luftPercent,
        riskSum: preset.riskSum,
        presetId: preset.id,
      };
    }
  }

  const fallback = await getDefaultRiskPreset(userId);
  if (!fallback) {
    return { riskPercent: 15, ratio: 3, luftPercent: 20, riskSum: 15, presetId: null };
  }
  return {
    riskPercent: fallback.riskPercent,
    ratio: fallback.ratio,
    luftPercent: fallback.luftPercent,
    riskSum: fallback.riskSum,
    presetId: fallback.id,
  };
}
