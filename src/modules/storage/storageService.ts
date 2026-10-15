import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { config } from '../../config';

const s3 = new S3Client({
  region: 'auto',
  endpoint: config.r2.endpoint,
  credentials: {
    accessKeyId:     config.r2.accessKeyId,
    secretAccessKey: config.r2.secretAccessKey,
  },
  // AWS SDK 3.729+ adds CRC32 checksums by default; R2 is incompatible → SignatureDoesNotMatch
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});

const IMAGE_EXTENSIONS: Record<string, string> = { png: 'png', webp: 'webp', jpeg: 'jpg', gif: 'gif' };

/**
 * Upload a base64 screenshot to Cloudflare R2.
 * Returns the public URL of the uploaded file.
 */
export async function uploadScreenshot(
  base64: string,
  dealId: number,
  type: 'setup' | 'entry' | 'close' | 'focus',
): Promise<string> {
  // Bare base64 without a data URL prefix is treated as PNG
  const format = /^data:image\/(\w+);base64,/.exec(base64)?.[1] ?? 'png';
  const extension = IMAGE_EXTENSIONS[format];
  if (!extension) throw new Error(`Unsupported screenshot format: ${format}`);

  const data = base64.replace(/^data:image\/\w+;base64,/, '');
  const buffer = Buffer.from(data, 'base64');

  const timestamp = Date.now();
  const key = `deals/${dealId}/${type}_${timestamp}.${extension}`;

  await s3.send(new PutObjectCommand({
    Bucket: config.r2.bucketName,
    Key: key,
    Body: buffer,
    ContentType: `image/${format}`,
  }));

  return `${config.r2.publicUrl}/${key}`;
}
