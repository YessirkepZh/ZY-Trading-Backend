export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/**
 * Rounds to 6 significant figures.
 * Works correctly for any price magnitude: large (45000 → 45000),
 * medium (1.2345 → 1.23450), small (0.00256 → 0.00256000).
 * Use for ATR and prices in crypto/forex where decimals matter.
 */
export function roundSmart(value: number): number {
  if (value === 0) return 0;
  return parseFloat(value.toPrecision(6));
}

/**
 * Rounds all numeric values in an object to 2 decimal places.
 * Returns a new object — does not mutate the original.
 */
export function roundFloatValues<T extends Record<string, unknown>>(obj: T): T {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    result[key] = typeof val === 'number' ? round2(val) : val;
  }
  return result as T;
}

export function formatNumber(value: number, decimals = 2): string {
  return value.toFixed(decimals);
}
