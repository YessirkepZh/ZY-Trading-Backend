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
// ── Bybit (crypto) ──────────────────────────────────────────────────────────
async function fetchBybit(symbol) {
    return (0, retry_1.retry)(async () => {
        const response = await axios_1.default.get('https://api.bybit.com/v5/market/kline', {
            params: { symbol, category: 'spot', interval: 'D', limit: BARS_LIMIT },
            timeout: 10000,
        });
        if (response.data.retCode !== 0) {
            throw new Error(`Bybit API error: retCode=${response.data.retCode}`);
        }
        // Bybit returns newest-first; reverse to oldest-first
        const raw = [...response.data.result.list].reverse();
        const bars = raw.map((r) => [
            Number(r[0]), // timestamp ms
            Number(r[1]), // open
            Number(r[2]), // high
            Number(r[3]), // low
            Number(r[4]), // close
            Number(r[5]), // volume
        ]);
        const openBar = bars[bars.length - 1];
        if (!openBar)
            throw new Error('No bars returned from Bybit');
        return { bars, openBar };
    });
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
        case 'crypto':
            return fetchBybit(symbol);
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