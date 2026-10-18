import { pool } from '../../db/pool';

export type AiPurpose =
  | 'check_setup'
  | 'analyze_closed'
  | 'analysis_report'
  | 'other';

export interface AiUsageMeta {
  userId?: number;
  dealId?: number;
  purpose: AiPurpose;
  tier: string;
  model: string;
}

export interface AiTokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationInputTokens: number;
  cacheReadInputTokens: number;
}

/**
 * Rough USD rates for cost estimates in logs (not billing).
 * Update when Anthropic list prices change. Cache reads are cheaper.
 */
const RATES_PER_MTOK: Record<string, { in: number; out: number; cacheWrite: number; cacheRead: number }> = {
  // Haiku-class default
  fast: { in: 1.0, out: 5.0, cacheWrite: 1.25, cacheRead: 0.1 },
  // Sonnet-class default
  smart: { in: 3.0, out: 15.0, cacheWrite: 3.75, cacheRead: 0.3 },
};

function estimateCostUsd(tier: string, u: AiTokenUsage): number {
  const r = RATES_PER_MTOK[tier] ?? RATES_PER_MTOK['fast']!;
  const cost =
    (u.inputTokens / 1e6) * r.in +
    (u.outputTokens / 1e6) * r.out +
    (u.cacheCreationInputTokens / 1e6) * r.cacheWrite +
    (u.cacheReadInputTokens / 1e6) * r.cacheRead;
  return Math.round(cost * 1e6) / 1e6;
}

export async function logAiUsage(params: {
  meta: AiUsageMeta;
  usage: AiTokenUsage;
  latencyMs?: number;
  ok?: boolean;
  error?: string;
}): Promise<void> {
  const { meta, usage } = params;
  const estimated = estimateCostUsd(meta.tier, usage);
  try {
    await pool.query(`
      INSERT INTO ai_usage_logs (
        user_id, deal_id, purpose, model, tier,
        input_tokens, output_tokens,
        cache_creation_input_tokens, cache_read_input_tokens,
        estimated_cost_usd, latency_ms, ok, error
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    `, [
      meta.userId ?? null,
      meta.dealId ?? null,
      meta.purpose,
      meta.model,
      meta.tier,
      usage.inputTokens,
      usage.outputTokens,
      usage.cacheCreationInputTokens,
      usage.cacheReadInputTokens,
      estimated,
      params.latencyMs ?? null,
      params.ok ?? true,
      params.error?.slice(0, 2000) ?? null,
    ]);
  } catch (err) {
    console.warn('[aiUsage] log failed (non-fatal):', err);
  }
}

export async function getUserUsageSummary(
  userId: number,
  days = 30,
): Promise<{ calls: number; inputTokens: number; outputTokens: number; estimatedCostUsd: number }> {
  const { rows } = await pool.query<{
    calls: string;
    input_tokens: string;
    output_tokens: string;
    estimated_cost_usd: string;
  }>(`
    SELECT
      COUNT(*)::text AS calls,
      COALESCE(SUM(input_tokens + cache_creation_input_tokens + cache_read_input_tokens), 0)::text AS input_tokens,
      COALESCE(SUM(output_tokens), 0)::text AS output_tokens,
      COALESCE(SUM(estimated_cost_usd), 0)::text AS estimated_cost_usd
    FROM ai_usage_logs
    WHERE user_id = $1
      AND created_at >= NOW() - ($2 * INTERVAL '1 day')
      AND ok = TRUE
  `, [userId, days]);

  const r = rows[0];
  return {
    calls: Number(r?.calls ?? 0),
    inputTokens: Number(r?.input_tokens ?? 0),
    outputTokens: Number(r?.output_tokens ?? 0),
    estimatedCostUsd: Number(r?.estimated_cost_usd ?? 0),
  };
}
