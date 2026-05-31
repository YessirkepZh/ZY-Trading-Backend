"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.round2 = round2;
exports.round4 = round4;
exports.roundFloatValues = roundFloatValues;
exports.formatNumber = formatNumber;
function round2(value) {
    return Math.round(value * 100) / 100;
}
function round4(value) {
    return Math.round(value * 10000) / 10000;
}
/**
 * Rounds all numeric values in an object to 2 decimal places.
 * Returns a new object — does not mutate the original.
 */
function roundFloatValues(obj) {
    const result = {};
    for (const key of Object.keys(obj)) {
        const val = obj[key];
        result[key] = typeof val === 'number' ? round2(val) : val;
    }
    return result;
}
function formatNumber(value, decimals = 2) {
    return value.toFixed(decimals);
}
//# sourceMappingURL=formatters.js.map