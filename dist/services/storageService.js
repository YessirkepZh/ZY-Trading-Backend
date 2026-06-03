"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadScreenshot = uploadScreenshot;
const client_s3_1 = require("@aws-sdk/client-s3");
const config_1 = require("../config");
const s3 = new client_s3_1.S3Client({
    region: 'auto',
    endpoint: config_1.config.r2.endpoint,
    credentials: {
        accessKeyId: config_1.config.r2.accessKeyId,
        secretAccessKey: config_1.config.r2.secretAccessKey,
    },
    // AWS SDK 3.729+ adds CRC32 checksums by default; R2 is incompatible → SignatureDoesNotMatch
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
});
/**
 * Upload a base64 screenshot to Cloudflare R2.
 * Returns the public URL of the uploaded file.
 */
async function uploadScreenshot(base64, dealId, type) {
    const data = base64.replace(/^data:image\/\w+;base64,/, '');
    const buffer = Buffer.from(data, 'base64');
    const timestamp = Date.now();
    const key = `deals/${dealId}/${type}_${timestamp}.png`;
    await s3.send(new client_s3_1.PutObjectCommand({
        Bucket: config_1.config.r2.bucketName,
        Key: key,
        Body: buffer,
        ContentType: 'image/png',
    }));
    return `${config_1.config.r2.publicUrl}/${key}`;
}
//# sourceMappingURL=storageService.js.map