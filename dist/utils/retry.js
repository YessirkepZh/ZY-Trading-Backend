"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.retry = retry;
async function retry(fn, options = {}) {
    const { attempts = 3, delayMs = 1000, onRetry } = options;
    for (let i = 0; i < attempts; i++) {
        try {
            return await fn();
        }
        catch (err) {
            if (i === attempts - 1)
                throw err;
            const handler = onRetry ?? ((e, attempt) => {
                console.warn(`[retry] attempt ${attempt}/${attempts - 1} failed:`, e.message);
            });
            handler(err, i + 1);
            await new Promise((r) => setTimeout(r, delayMs * Math.pow(2, i)));
        }
    }
    throw new Error('unreachable');
}
//# sourceMappingURL=retry.js.map