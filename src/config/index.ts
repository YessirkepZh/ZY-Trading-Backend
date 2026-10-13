import { randomBytes } from 'crypto';
import dotenv from 'dotenv';
dotenv.config();

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required env variable: ${key}`);
  return val;
}

const DEFAULT_PRODUCTION_ORIGINS = [
  'https://zy-trading-frontend-production.up.railway.app',
  'http://localhost:3000',
  'http://localhost:5173',
];

function parseCorsOrigins(): string[] | true {
  const raw = process.env['CORS_ORIGINS']?.trim();
  if (raw) {
    return raw.split(',').map(s => s.trim().replace(/\/$/, '')).filter(Boolean);
  }
  const nodeEnv = process.env['NODE_ENV'] || 'development';
  if (nodeEnv === 'production') {
    return DEFAULT_PRODUCTION_ORIGINS;
  }
  return true;
}

function resolveJwtSecret(): string {
  const secret = process.env['JWT_SECRET']?.trim();
  if (secret) return secret;
  if ((process.env['NODE_ENV'] || 'development') === 'production') {
    throw new Error('Missing required env variable: JWT_SECRET');
  }
  console.warn('JWT_SECRET is not set — using an ephemeral secret, sessions reset on restart');
  return randomBytes(32).toString('hex');
}

// Polling with the same token from two instances steals updates from production
const botEnabled = process.env['BOT_ENABLED'] !== 'false';

export const config = {
  port: Number(process.env['PORT']) || 3001,
  nodeEnv: process.env['NODE_ENV'] || 'development',
  corsOrigins: parseCorsOrigins(),
  // Legacy shared key, acts as the owner account. Empty value disables it
  apiKey: process.env['API_KEY']?.trim() ?? '',

  auth: {
    jwtSecret: resolveJwtSecret(),
    accessTokenTtlSec: 15 * 60,
    refreshTokenTtlSec: 30 * 24 * 60 * 60,
    inviteTtlSec: 7 * 24 * 60 * 60,
  },

  telegram: {
    enabled: botEnabled,
    token: botEnabled ? required('TELEGRAM_TOKEN') : '',
    allowedUsers: botEnabled ? required('ALLOWED_USERS').split(',').map(Number) : [],
  },

  polygon: {
    apiKey: process.env['POLYGON_API_KEY'] ?? '',  // fallback
  },

  twelveData: {
    apiKey: process.env['TWELVE_DATA_API_KEY'] ?? '',
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
