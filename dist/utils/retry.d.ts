export declare function retry<T>(fn: () => Promise<T>, options?: {
    attempts?: number;
    delayMs?: number;
    onRetry?: (err: Error, attempt: number) => void;
}): Promise<T>;
