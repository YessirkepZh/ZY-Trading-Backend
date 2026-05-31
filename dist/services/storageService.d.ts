/**
 * Upload a base64 screenshot to Cloudflare R2.
 * Returns the public URL of the uploaded file.
 */
export declare function uploadScreenshot(base64: string, dealId: number, type: 'setup' | 'entry' | 'close'): Promise<string>;
