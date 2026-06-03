import dotenv from 'dotenv';
dotenv.config();

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env variable: ${key}`);
  return val;
}

export const config = {
  port: Number(process.env['PORT']) || 3001,
  nodeEnv: process.env['NODE_ENV'] || 'development',

  telegram: {
    token: required('TELEGRAM_TOKEN'),
    allowedUsers: required('ALLOWED_USERS').split(',').map(Number),
  },

  polygon: {
    apiKey: required('POLYGON_API_KEY'),
  },

  cryptoCompare: {
    apiKey: required('CRYPTOCOMPARE_API_KEY'),
  },

  anthropic: {
    apiKey: required('ANTHROPIC_API_KEY'),
    model: 'claude-opus-4-5',
  },

  db: {
    connectionString: required('DATABASE_URL'),
  },

  risk: {
    cryptoDefault: Number(process.env['RISK_CRYPTO_DEFAULT']) || 15,
    luftPercent: Number(process.env['LUFT_PERCENT']) || 20,
    ratio: Number(process.env['RATIO']) || 3,
    riskSum: Number(process.env['RISK_SUM']) || 15,
  },

  r2: (() => {
    const accountId = required('R2_ACCOUNT_ID');
    return {
      accountId,
      accessKeyId:     required('R2_ACCESS_KEY_ID'),
      secretAccessKey: required('R2_SECRET_ACCESS_KEY'),
      bucketName:      required('R2_BUCKET_NAME'),
      publicUrl:       required('R2_PUBLIC_URL'),
      endpoint:        `https://${accountId}.r2.cloudflarestorage.com`,
    };
  })(),
} as const;
