import { pool } from '../../db/pool';
import type { ChecklistSnapshot, Direction, MarketType, Strategy } from '../../shared/trading';
import type { CalculationResult, Deal } from '../deals/types';

/** Local structured embedding — $0, no external embedding API. Swap later for OpenAI/Voyage. */
export const EMBEDDING_MODEL = 'structured-v1';
export const EMBEDDING_DIMS = 64;

export interface SetupFingerprintInput {
  strategy: Strategy;
  marketType: MarketType;
  direction: Direction;
  calcResult: Pick<CalculationResult, 'atrPercent' | 'passRoad' | 'stopLossByStop'>;
  checklist: ChecklistSnapshot;
  ticker: string;
}

export interface SimilarDealHit {
  dealId: number;
  distance: number;
  contentText: string;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function l2Normalize(v: number[]): number[] {
  let sum = 0;
  for (const x of v) sum += x * x;
  const norm = Math.sqrt(sum);
  if (norm < 1e-9) return v;
  return v.map((x) => x / norm);
}

function hashBucket(key: string, buckets: number): number {
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = (h * 31 + key.charCodeAt(i)) >>> 0;
  }
  return h % buckets;
}

/**
 * Deterministic 64-d vector from setup features (strategy, ATR%, passRoad, checklist).
 * Good enough for "similar setups" without paid embedding APIs.
 */
export function buildStructuredEmbedding(input: SetupFingerprintInput): number[] {
  const v = new Array<number>(EMBEDDING_DIMS).fill(0);

  const strategies: Strategy[] = ['Пробой', 'Ложный Пробой', 'Отбой'];
  const si = strategies.indexOf(input.strategy);
  if (si >= 0) v[si] = 1;

  const markets: MarketType[] = ['crypto', 'stocks', 'forex'];
  const mi = markets.indexOf(input.marketType);
  if (mi >= 0) v[3 + mi] = 1;

  v[6] = input.direction === 'long' ? 1 : 0;
  v[7] = clamp01((input.calcResult.atrPercent ?? 0) / 10);
  v[8] = clamp01((input.calcResult.passRoad ?? 0) / 200);
  v[9] = input.calcResult.stopLossByStop !== undefined ? 1 : 0;

  const checklistBuckets = 20;
  const base = 10;
  const bump = (idx: number, delta: number): void => {
    const cur = v[idx] ?? 0;
    v[idx] = cur + delta;
  };
  for (const key of input.checklist.plus) {
    bump(base + hashBucket(key, checklistBuckets), 1);
  }
  for (const key of input.checklist.minus) {
    bump(base + hashBucket(key, checklistBuckets), -1);
  }
  for (const key of input.checklist.wait) {
    bump(base + hashBucket(key, checklistBuckets), 0.4);
  }

  // Soft ticker signal (same asset tends to cluster)
  const t = input.ticker.toUpperCase().replace(/[^A-Z0-9]/g, '');
  bump(30 + hashBucket(t, 16), 0.5);

  return l2Normalize(v);
}

export function buildContentText(deal: Deal): string {
  const atr = deal.calcResult.atrPercent != null ? `${deal.calcResult.atrPercent.toFixed(2)}%` : 'n/a';
  const pr = deal.calcResult.passRoad != null ? `${deal.calcResult.passRoad.toFixed(0)}%` : 'n/a';
  const result = deal.dealResult ?? 'unknown';
  const plus = (deal.checklistSnapshot?.plus ?? []).join(',') || '-';
  const minus = (deal.checklistSnapshot?.minus ?? []).join(',') || '-';
  return [
    `#${deal.id} ${deal.ticker} ${deal.strategy} ${deal.direction}`,
    `result=${result} ATR%=${atr} passRoad=${pr}`,
    `plus=[${plus}] minus=[${minus}]`,
  ].join(' | ');
}

function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.map((x) => (Number.isFinite(x) ? x.toFixed(6) : '0')).join(',')}]`;
}

export async function upsertDealEmbedding(deal: Deal): Promise<void> {
  if (deal.status !== 'closed') return;

  const checklist = deal.checklistSnapshot ?? { plus: [], minus: [], wait: [] };
  const embedding = buildStructuredEmbedding({
    strategy: deal.strategy,
    marketType: deal.marketType,
    direction: deal.direction,
    calcResult: deal.calcResult,
    checklist,
    ticker: deal.ticker,
  });
  const contentText = buildContentText(deal);
  const literal = toVectorLiteral(embedding);

  await pool.query(`
    INSERT INTO deal_embeddings (deal_id, user_id, strategy, content_text, embedding, model, updated_at)
    VALUES ($1, $2, $3, $4, $5::vector, $6, NOW())
    ON CONFLICT (deal_id) DO UPDATE SET
      user_id = EXCLUDED.user_id,
      strategy = EXCLUDED.strategy,
      content_text = EXCLUDED.content_text,
      embedding = EXCLUDED.embedding,
      model = EXCLUDED.model,
      updated_at = NOW()
  `, [deal.id, deal.userId, deal.strategy, contentText, literal, EMBEDDING_MODEL]);
}

export async function findSimilarClosedDeals(params: {
  userId: number;
  strategy: Strategy;
  fingerprint: SetupFingerprintInput;
  excludeDealId?: number;
  limit?: number;
}): Promise<SimilarDealHit[]> {
  const limit = params.limit ?? 5;
  const embedding = buildStructuredEmbedding(params.fingerprint);
  const literal = toVectorLiteral(embedding);

  const { rows } = await pool.query<{
    deal_id: number;
    content_text: string;
    distance: number;
  }>(`
    SELECT e.deal_id, e.content_text, (e.embedding <=> $1::vector) AS distance
    FROM deal_embeddings e
    WHERE e.user_id = $2
      AND e.strategy = $3
      AND e.model = $4
      AND ($5::int IS NULL OR e.deal_id <> $5)
    ORDER BY e.embedding <=> $1::vector
    LIMIT $6
  `, [literal, params.userId, params.strategy, EMBEDDING_MODEL, params.excludeDealId ?? null, limit]);

  return rows.map((r) => ({
    dealId: r.deal_id,
    distance: Number(r.distance),
    contentText: r.content_text,
  }));
}

export function formatSimilarDealsForPrompt(hits: SimilarDealHit[]): string {
  if (hits.length === 0) return '';
  const lines = hits.map((h, i) => `${i + 1}. ${h.contentText} (distance=${h.distance.toFixed(3)})`);
  return [
    'Similar closed deals from THIS trader only (permission-aware RAG):',
    ...lines,
    'Weight personal outcomes: repeated losses on similar setups → caution; repeated wins → supportive but not automatic take.',
  ].join('\n');
}

/** Best-effort: never fail the main Claude flow if RAG is unavailable. */
export async function getSimilarDealsPromptBlock(params: {
  userId: number;
  strategy: Strategy;
  fingerprint: SetupFingerprintInput;
  excludeDealId?: number;
}): Promise<string> {
  try {
    const hits = await findSimilarClosedDeals(params);
    return formatSimilarDealsForPrompt(hits);
  } catch (err) {
    console.warn('[rag] similar deals lookup failed (non-fatal):', err);
    return '';
  }
}
