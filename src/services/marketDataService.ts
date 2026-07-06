import axios from 'axios';
import { parse } from 'csv-parse/sync';
import { config } from '../config';
import { retry } from '../utils/retry';
import type { MarketType } from '../types/deal';
import type { MarketData, OhlcvBar } from '../types/market';

const BARS_LIMIT = 65;

// ── CryptoCompare (crypto) ───────────────────────────────────────────────────

function parseCryptoTicker(ticker: string): { fsym: string; tsym: string } {
  const quoteAssets = ['USDT', 'BUSD', 'USD', 'BTC', 'ETH', 'BNB'];
  for (const quote of quoteAssets) {
    if (ticker.toUpperCase().endsWith(quote)) {
      return {
        fsym: ticker.slice(0, -quote.length).toUpperCase(),
        tsym: quote,
      };
    }
  }
  return { fsym: ticker.toUpperCase(), tsym: 'USD' };
}

interface CryptoCompareBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volumefrom: number;
}

async function fetchCryptoCompareOhlcv(ticker: string): Promise<OhlcvBar[]> {
  return retry(async () => {
    const { fsym, tsym } = parseCryptoTicker(ticker);
    const response = await axios.get<{
      Data: { Data: CryptoCompareBar[] };
    }>('https://min-api.cryptocompare.com/data/v2/histoday', {
      params: {
        fsym,
        tsym,
        limit: BARS_LIMIT,
        api_key: config.cryptoCompare.apiKey,
      },
      timeout: 10000,
    });

    // CryptoCompare returns oldest-first; last bar is the current (unclosed) day — remove it
    const bars: OhlcvBar[] = response.data.Data.Data
      .slice(0, -1)
      .map((r) => [r.time * 1000, r.open, r.high, r.low, r.close, r.volumefrom]);

    if (bars.length < 10) {
      throw new Error(`Not enough bars for ${ticker} (${fsym}/${tsym}): ${bars.length}`);
    }

    return bars;
  }, { attempts: 3, delayMs: 1000 });
}

// ── Polygon.io (stocks) ──────────────────────────────────────────────────────

async function fetchPolygon(symbol: string): Promise<MarketData> {
  return retry(async () => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - BARS_LIMIT * 2); // fetch extra to account for non-trading days

    const toStr = to.toISOString().split('T')[0]!;
    const fromStr = from.toISOString().split('T')[0]!;

    const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${fromStr}/${toStr}`;
    const response = await axios.get<{
      results: Array<{ t: number; o: number; h: number; l: number; c: number; v: number }>;
    }>(url, {
      params: { apiKey: config.polygon.apiKey, sort: 'asc', limit: BARS_LIMIT },
      timeout: 10000,
    });

    const results = response.data.results ?? [];
    const bars: OhlcvBar[] = results.slice(-BARS_LIMIT).map((r) => [
      r.t, r.o, r.h, r.l, r.c, r.v,
    ]);

    const openBar = bars[bars.length - 1];
    if (!openBar) throw new Error('No bars returned from Polygon');
    return { bars, openBar };
  });
}

// ── Twelve Data (stocks) ─────────────────────────────────────────────────────

interface TwelveDataBar {
  datetime: string;
  open:     string;
  high:     string;
  low:      string;
  close:    string;
  volume:   string;
}

async function fetchTwelveData(symbol: string): Promise<MarketData> {
  return retry(async () => {
    const response = await axios.get<{
      status: string;
      message?: string;
      values?: TwelveDataBar[];
    }>('https://api.twelvedata.com/time_series', {
      params: {
        symbol,
        interval:   '1day',
        outputsize: BARS_LIMIT,
        apikey:     config.twelveData.apiKey,
      },
      timeout: 10000,
    });

    const data = response.data;

    if (data.status === 'error') {
      throw new Error(`Twelve Data error for ${symbol}: ${data.message ?? 'unknown'}`);
    }

    if (!data.values || data.values.length === 0) {
      throw new Error(`Twelve Data: no values returned for ${symbol}`);
    }

    // Twelve Data returns newest-first — reverse to oldest-first
    const reversed = [...data.values].reverse();

    const bars: OhlcvBar[] = reversed.map((v) => [
      new Date(v.datetime).getTime(),
      parseFloat(v.open),
      parseFloat(v.high),
      parseFloat(v.low),
      parseFloat(v.close),
      parseFloat(v.volume) || 0,
    ]);

    if (bars.length < 10) {
      throw new Error(`Twelve Data: not enough bars for ${symbol}: ${bars.length}`);
    }

    // Last bar = current (potentially unclosed) day candle
    const currentBar = bars[bars.length - 1];
    // Closed bars = all except current day
    const closedBars = bars.slice(0, -1);
    const openBar = closedBars[closedBars.length - 1];

    if (!openBar) throw new Error(`No openBar for ${symbol}`);

    return { bars: closedBars, openBar, currentBar };
  }, { attempts: 3, delayMs: 1000 });
}

// ── Stooq (forex) ────────────────────────────────────────────────────────────

async function fetchStooq(symbol: string): Promise<MarketData> {
  return retry(async () => {
    const response = await axios.get<string>(
      `https://stooq.com/q/d/l/?s=${symbol.toLowerCase()}&i=d`,
      { responseType: 'text', timeout: 10000 },
    );

    type CsvRow = { Date: string; Open: string; High: string; Low: string; Close: string; Volume: string };
    const records: CsvRow[] = parse(response.data, {
      columns: true,
      skip_empty_lines: true,
    }) as CsvRow[];

    const bars: OhlcvBar[] = records.slice(-BARS_LIMIT).map((r) => [
      new Date(r.Date).getTime(),
      parseFloat(r.Open),
      parseFloat(r.High),
      parseFloat(r.Low),
      parseFloat(r.Close),
      parseFloat(r.Volume || '0'),
    ]);

    const openBar = bars[bars.length - 1];
    if (!openBar) throw new Error('No bars returned from Stooq');
    return { bars, openBar };
  });
}

// ── Public API ───────────────────────────────────────────────────────────────

export async function getMarketData(
  symbol: string,
  marketType: MarketType,
): Promise<MarketData> {
  switch (marketType) {
    case 'crypto': {
      const allBars = await fetchCryptoCompareOhlcv(symbol);
      // Last bar = current (potentially unclosed) day candle → used for passRoad
      const currentBar = allBars[allBars.length - 1];
      // Closed bars only (exclude current day) → used for ATR + entry calculations
      const bars = allBars.slice(0, -1);
      const openBar = bars[bars.length - 1];
      if (!openBar) throw new Error(`No openBar for ${symbol}`);
      return { bars, openBar, currentBar };
    }
    case 'stocks': {
      if (config.twelveData.apiKey) {
        try {
          return await fetchTwelveData(symbol);
        } catch (err) {
          console.warn('[marketData] Twelve Data failed, falling back to Polygon:', (err as Error).message);
        }
      }
      return fetchPolygon(symbol);
    }
    case 'forex':
      return fetchStooq(symbol);
  }
}

/**
 * Formats the last N bars as a human-readable summary for Claude.
 */
export function formatOhlcvSummary(bars: OhlcvBar[], count = 10): string {
  const recent = bars.slice(-count);
  return recent
    .map((b) => {
      const date = new Date(b[0]).toISOString().split('T')[0] ?? '';
      return `${date} O:${b[1]} H:${b[2]} L:${b[3]} C:${b[4]} V:${b[5]}`;
    })
    .join('\n');
}

function barToSnapshot(bar: OhlcvBar) {
  return {
    date: new Date(bar[0]).toISOString().split('T')[0] ?? '',
    timestamp: bar[0],
    open: bar[1],
    high: bar[2],
    low: bar[3],
    close: bar[4],
    volume: bar[5],
  };
}

export interface MarketPriceResult {
  ticker: string;
  marketType: 'stocks' | 'crypto' | 'forex';
  source: string;
  price: number;
  currentBar: ReturnType<typeof barToSnapshot> | null;
  lastClosedBar: ReturnType<typeof barToSnapshot>;
  barsCount: number;
  ohlcvSummary: string;
}

export async function getStockPrice(ticker: string): Promise<MarketPriceResult> {
  let data: MarketData;
  let source: string;

  if (config.twelveData.apiKey) {
    try {
      data = await fetchTwelveData(ticker);
      source = 'twelveData';
    } catch (err) {
      console.warn('[marketData] Twelve Data failed, falling back to Polygon:', (err as Error).message);
      data = await fetchPolygon(ticker);
      source = 'polygon';
    }
  } else {
    data = await fetchPolygon(ticker);
    source = 'polygon';
  }

  const priceBar = data.currentBar ?? data.openBar;

  return {
    ticker: ticker.toUpperCase(),
    marketType: 'stocks',
    source,
    price: priceBar[4],
    currentBar: data.currentBar ? barToSnapshot(data.currentBar) : null,
    lastClosedBar: barToSnapshot(data.openBar),
    barsCount: data.bars.length,
    ohlcvSummary: formatOhlcvSummary(
      data.currentBar ? [...data.bars, data.currentBar] : data.bars,
      5,
    ),
  };
}

export async function getCryptoPrice(ticker: string): Promise<MarketPriceResult> {
  const data = await getMarketData(ticker, 'crypto');
  const priceBar = data.currentBar ?? data.openBar;

  return {
    ticker: ticker.toUpperCase(),
    marketType: 'crypto',
    source: 'cryptoCompare',
    price: priceBar[4],
    currentBar: data.currentBar ? barToSnapshot(data.currentBar) : null,
    lastClosedBar: barToSnapshot(data.openBar),
    barsCount: data.bars.length,
    ohlcvSummary: formatOhlcvSummary(
      data.currentBar ? [...data.bars, data.currentBar] : data.bars,
      5,
    ),
  };
}

export async function getForexPrice(ticker: string): Promise<MarketPriceResult> {
  const data = await getMarketData(ticker, 'forex');
  const priceBar = data.currentBar ?? data.openBar;

  return {
    ticker: ticker.toUpperCase(),
    marketType: 'forex',
    source: 'stooq',
    price: priceBar[4],
    currentBar: data.currentBar ? barToSnapshot(data.currentBar) : null,
    lastClosedBar: barToSnapshot(data.openBar),
    barsCount: data.bars.length,
    ohlcvSummary: formatOhlcvSummary(
      data.currentBar ? [...data.bars, data.currentBar] : data.bars,
      5,
    ),
  };
}
