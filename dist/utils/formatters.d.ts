export declare function round2(value: number): number;
export declare function round4(value: number): number;
/**
 * Rounds all numeric values in an object to 2 decimal places.
 * Returns a new object — does not mutate the original.
 */
export declare function roundFloatValues<T extends Record<string, unknown>>(obj: T): T;
export declare function formatNumber(value: number, decimals?: number): string;
