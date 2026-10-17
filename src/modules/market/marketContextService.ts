import axios from 'axios';
import { config } from '../../config';
import { retry } from '../../shared/retry';

const CACHE_TTL_MS = 15 * 60 * 1000;

export interface ContextInstrument {
  /** Display symbol in the prompt */
  symbol: string;
  /** What this proxy represents for the trader */
  role: string;
  change1dPct: number | null;
  source: string;
  error?: string;
}

export interface MarketContextSnapshot {
  fetchedAt: Date;
  instruments: ContextInstrument[];
}

interface CacheEntry {
  at: number;
  snapshot: MarketContextSnapshot;
}

let cache: CacheEntry | null = null;

function pctChange(prev: number, last: number): number | null {
  if (!Number.isFinite(prev) || !Number.isFinite(last) || prev === 0) return null;
  return ((last - prev) / prev) * 100;
}

function formatPct(pct: number | null): string {
  if (pct == null) return 'n/a';
  if (Math.abs(pct) < 0.05) return 'flat';
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(2)}%`;
}

async function fetchBtc1d(): Promise<ContextInstrument> {
  const role = 'Bitcoin (risk / altcoin beta)';
  try {
    const change1dPct = await retry(async () => {
      const response = await axios.get<{
        Data: { Data: Array<{ close: number }> };
      }>('https://min-api.cryptocompare.com/data/v2/histoday', {
        params: {
          fsym: 'BTC',
          tsym: 'USDT',
          limit: 3,
          api_key: config.cryptoCompare.apiKey,
        },
        timeout: 10000,
      });
      // oldest→newest; drop unclosed current day when present
      const bars = response.data.Data.Data.slice(0, -1);
      const last = bars[bars.length - 1];
      const prev = bars[bars.length - 2];
      if (!last || !prev) throw new Error('not enough BTC bars');
      return pctChange(prev.close, last.close);
    }, { attempts: 2, delayMs: 500 });

    return { symbol: 'BTCUSDT', role, change1dPct, source: 'cryptoCompare' };
  } catch (err) {
    return {
      symbol: 'BTCUSDT',
      role,
      change1dPct: null,
      source: 'cryptoCompare',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function fetchPolygon1d(symbol: string): Promise<{ change1dPct: number | null; source: string }> {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - 10);
  const toStr = to.toISOString().slice(0, 10);
  const fromStr = from.toISOString().slice(0, 10);

  const response = await axios.get<{
    results?: Array<{ c: number }>;
    status?: string;
  }>(`https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${fromStr}/${toStr}`, {
    params: { apiKey: config.polygon.apiKey, sort: 'asc', limit: 10 },
    timeout: 10000,
  });

  const results = response.data.results ?? [];
  const last = results[results.length - 1];
  const prev = results[results.length - 2];
  if (!last || !prev) throw new Error(`Polygon: not enough bars for ${symbol}`);
  return { change1dPct: pctChange(prev.c, last.c), source: 'polygon' };
}

async function fetchTwelveData1d(symbol: string): Promise<{ change1dPct: number | null; source: string }> {
  if (!config.twelveData.apiKey) {
    throw new Error('Twelve Data API key not configured');
  }
  const response = await axios.get<{
    status: string;
    message?: string;
    values?: Array<{ close: string }>;
  }>('https://api.twelvedata.com/time_series', {
    params: {
      symbol,
      interval: '1day',
      outputsize: 3,
      apikey: config.twelveData.apiKey,
    },
    timeout: 10000,
  });

  if (response.data.status === 'error') {
    throw new Error(response.data.message ?? `Twelve Data error for ${symbol}`);
  }
  const values = response.data.values ?? [];
  // newest-first
  const last = values[0];
  const prev = values[1];
  if (!last || !prev) throw new Error(`Twelve Data: not enough bars for ${symbol}`);
  return {
    change1dPct: pctChange(parseFloat(prev.close), parseFloat(last.close)),
    source: 'twelveData',
  };
}

async function fetchStock1d(symbol: string, role: string): Promise<ContextInstrument> {
  try {
    // Prefer Polygon (verified free key); TwelveData is rate-limited hard on free tier
    if (config.polygon.apiKey) {
      try {
        const { change1dPct, source } = await retry(
          () => fetchPolygon1d(symbol),
          { attempts: 2, delayMs: 500 },
        );
        return { symbol, role, change1dPct, source };
      } catch (err) {
        console.warn(`[marketContext] Polygon ${symbol} failed:`, (err as Error).message);
      }
    }
    const { change1dPct, source } = await retry(
      () => fetchTwelveData1d(symbol),
      { attempts: 2, delayMs: 500 },
    );
    return { symbol, role, change1dPct, source };
  } catch (err) {
    return {
      symbol,
      role,
      change1dPct: null,
      source: 'none',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function fetchFresh(): Promise<MarketContextSnapshot> {
  const [btc, spy, uup] = await Promise.all([
    fetchBtc1d(),
    fetchStock1d('SPY', 'US equities risk (broad market)'),
    fetchStock1d('UUP', 'US Dollar proxy (DXY unavailable on free plans)'),
  ]);

  return {
    fetchedAt: new Date(),
    instruments: [btc, spy, uup],
  };
}

/** Shared 15-minute cache — safe for free API tiers. */
export async function getMarketContext(force = false): Promise<MarketContextSnapshot> {
  if (!force && cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return cache.snapshot;
  }
  const snapshot = await fetchFresh();
  cache = { at: Date.now(), snapshot };
  return snapshot;
}

/** One block for the Claude checkSetup user message. */
export function formatMarketContextForPrompt(snapshot: MarketContextSnapshot): string {
  const lines = snapshot.instruments.map((i) => {
    const pct = formatPct(i.change1dPct);
    const err = i.error ? ` (unavailable: ${i.error})` : '';
    return `- ${i.symbol} 1D ${pct} — ${i.role} [${i.source}]${err}`;
  });
  return [
    'Market context (daily % change, shared cache ≤15m):',
    ...lines,
    'Use this as risk backdrop: BTC down hurts altcoin longs; SPY down = risk-off; UUP up = stronger USD.',
  ].join('\n');
}

export async function getMarketContextPromptBlock(): Promise<string> {
  try {
    const snapshot = await getMarketContext();
    return formatMarketContextForPrompt(snapshot);
  } catch (err) {
    console.warn('[marketContext] failed:', err);
    return 'Market context: unavailable';
  }
}
