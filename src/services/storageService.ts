import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { config } from '../config';

const s3 = new S3Client({
  region: 'auto',
  endpoint: config.r2.endpoint,
  credentials: {
    accessKeyId:     config.r2.accessKeyId,
    secretAccessKey: config.r2.secretAccessKey,
  },
});

/**
 * Upload a base64 screenshot to Cloudflare R2.
 * Returns the public URL of the uploaded file.
 */
export async function uploadScreenshot(
  base64: string,
  dealId: number,
  type: 'setup' | 'entry' | 'close',
): Promise<string> {
  const data = base64.replace(/^data:image\/\w+;base64,/, '');
  const buffer = Buffer.from(data, 'base64');

  const timestamp = Date.now();
  const key = `deals/${dealId}/${type}_${timestamp}.png`;

  await s3.send(new PutObjectCommand({
    Bucket: config.r2.bucketName,
    Key: key,
    Body: buffer,
    ContentType: 'image/png',
  }));

  return `${config.r2.publicUrl}/${key}`;
}
