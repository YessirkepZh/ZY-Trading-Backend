export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    attempts?: number;
    delayMs?: number;
    onRetry?: (err: Error, attempt: number) => void;
  } = {},
): Promise<T> {
  const { attempts = 3, delayMs = 1000, onRetry } = options;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      if (i === attempts - 1) throw err;
      const handler = onRetry ?? ((e: Error, attempt: number) => {
        console.warn(`[retry] attempt ${attempt}/${attempts - 1} failed:`, e.message);
      });
      handler(err as Error, i + 1);
      await new Promise((r) => setTimeout(r, delayMs * Math.pow(2, i)));
    }
  }
  throw new Error('unreachable');
}
