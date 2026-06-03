"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMarketData = getMarketData;
exports.formatOhlcvSummary = formatOhlcvSummary;
const axios_1 = __importDefault(require("axios"));
const sync_1 = require("csv-parse/sync");
const config_1 = require("../config");
const retry_1 = require("../utils/retry");
const BARS_LIMIT = 65;
// ── CryptoCompare (crypto) ───────────────────────────────────────────────────
function parseCryptoTicker(ticker) {
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
async function fetchCryptoCompareOhlcv(ticker) {
    return (0, retry_1.retry)(async () => {
        const { fsym, tsym } = parseCryptoTicker(ticker);
        const response = await axios_1.default.get('https://min-api.cryptocompare.com/data/v2/histoday', {
            params: {
                fsym,
                tsym,
                limit: BARS_LIMIT,
                api_key: config_1.config.cryptoCompare.apiKey,
            },
            timeout: 10000,
        });
        // CryptoCompare returns oldest-first; last bar is the current (unclosed) day — remove it
        const bars = response.data.Data.Data
            .slice(0, -1)
            .map((r) => [r.time * 1000, r.open, r.high, r.low, r.close, r.volumefrom]);
        if (bars.length < 10) {
            throw new Error(`Not enough bars for ${ticker} (${fsym}/${tsym}): ${bars.length}`);
        }
        return bars;
    }, { attempts: 3, delayMs: 1000 });
}
// ── Polygon.io (stocks) ──────────────────────────────────────────────────────
async function fetchPolygon(symbol) {
    return (0, retry_1.retry)(async () => {
        const to = new Date();
        const from = new Date();
        from.setDate(from.getDate() - BARS_LIMIT * 2); // fetch extra to account for non-trading days
        const toStr = to.toISOString().split('T')[0];
        const fromStr = from.toISOString().split('T')[0];
        const url = `https://api.polygon.io/v2/aggs/ticker/${symbol}/range/1/day/${fromStr}/${toStr}`;
        const response = await axios_1.default.get(url, {
            params: { apiKey: config_1.config.polygon.apiKey, sort: 'asc', limit: BARS_LIMIT },
            timeout: 10000,
        });
        const results = response.data.results ?? [];
        const bars = results.slice(-BARS_LIMIT).map((r) => [
            r.t, r.o, r.h, r.l, r.c, r.v,
        ]);
        const openBar = bars[bars.length - 1];
        if (!openBar)
            throw new Error('No bars returned from Polygon');
        return { bars, openBar };
    });
}
// ── Stooq (forex) ────────────────────────────────────────────────────────────
async function fetchStooq(symbol) {
    return (0, retry_1.retry)(async () => {
        const response = await axios_1.default.get(`https://stooq.com/q/d/l/?s=${symbol.toLowerCase()}&i=d`, { responseType: 'text', timeout: 10000 });
        const records = (0, sync_1.parse)(response.data, {
            columns: true,
            skip_empty_lines: true,
        });
        const bars = records.slice(-BARS_LIMIT).map((r) => [
            new Date(r.Date).getTime(),
            parseFloat(r.Open),
            parseFloat(r.High),
            parseFloat(r.Low),
            parseFloat(r.Close),
            parseFloat(r.Volume || '0'),
        ]);
        const openBar = bars[bars.length - 1];
        if (!openBar)
            throw new Error('No bars returned from Stooq');
        return { bars, openBar };
    });
}
// ── Public API ───────────────────────────────────────────────────────────────
async function getMarketData(symbol, marketType) {
    switch (marketType) {
        case 'crypto': {
            const allBars = await fetchCryptoCompareOhlcv(symbol);
            // Last bar = current (potentially unclosed) day candle → used for passRoad
            const currentBar = allBars[allBars.length - 1];
            // Closed bars only (exclude current day) → used for ATR + entry calculations
            const bars = allBars.slice(0, -1);
            const openBar = bars[bars.length - 1];
            if (!openBar)
                throw new Error(`No openBar for ${symbol}`);
            return { bars, openBar, currentBar };
        }
        case 'stocks':
            return fetchPolygon(symbol);
        case 'forex':
            return fetchStooq(symbol);
    }
}
/**
 * Formats the last N bars as a human-readable summary for Claude.
 */
function formatOhlcvSummary(bars, count = 10) {
    const recent = bars.slice(-count);
    return recent
        .map((b) => {
        const date = new Date(b[0]).toISOString().split('T')[0] ?? '';
        return `${date} O:${b[1]} H:${b[2]} L:${b[3]} C:${b[4]} V:${b[5]}`;
    })
        .join('\n');
}
//# sourceMappingURL=marketDataService.js.map