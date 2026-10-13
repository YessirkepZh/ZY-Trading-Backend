import { randomBytes } from 'crypto';
import { env } from './confFile';

function required(key: string): string {
  const val = env(key);
  if (!val) throw new Error(`Missing required setting: ${key} (env variable or config/conf.json)`);
  return val;
}

const DEFAULT_PRODUCTION_ORIGINS = [
  'https://zy-trading-frontend-production.up.railway.app',
  'http://localhost:3000',
  'http://localhost:5173',
];

function parseCorsOrigins(): string[] | true {
  const raw = env('CORS_ORIGINS')?.trim();
  if (raw) {
    return raw.split(',').map(s => s.trim().replace(/\/$/, '')).filter(Boolean);
  }
  const nodeEnv = env('NODE_ENV') || 'development';
  if (nodeEnv === 'production') {
    return DEFAULT_PRODUCTION_ORIGINS;
  }
  return true;
}

function resolveJwtSecret(): string {
  const secret = env('JWT_SECRET')?.trim();
  if (secret) return secret;
  if ((env('NODE_ENV') || 'development') === 'production') {
    throw new Error('Missing required setting: JWT_SECRET (env variable or config/conf.json)');
  }
  console.warn('JWT_SECRET is not set — using an ephemeral secret, sessions reset on restart');
  return randomBytes(32).toString('hex');
}

// Polling with the same token from two instances steals updates from production
const botEnabled = (env('BOT_ENABLED') ?? 'true') !== 'false';

export const config = {
  port: Number(env('PORT')) || 3001,
  nodeEnv: env('NODE_ENV') || 'development',
  corsOrigins: parseCorsOrigins(),

  auth: {
    jwtSecret: resolveJwtSecret(),
    accessTokenTtlSec: 15 * 60,
    refreshTokenTtlSec: 30 * 24 * 60 * 60,
    inviteTtlSec: 7 * 24 * 60 * 60,
    // Simultaneous web logins per non-admin user; the oldest session is signed out
    maxSessionsPerUser: 2,
  },

  telegram: {
    enabled: botEnabled,
    token: botEnabled ? required('TELEGRAM_TOKEN') : '',
    allowedUsers: botEnabled ? required('ALLOWED_USERS').split(',').map(Number) : [],
  },

  polygon: {
    apiKey: env('POLYGON_API_KEY') ?? '',  // fallback
  },

  twelveData: {
    apiKey: env('TWELVE_DATA_API_KEY') ?? '',
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
    cryptoDefault: Number(env('RISK_CRYPTO_DEFAULT')) || 15,
    luftPercent: Number(env('LUFT_PERCENT')) || 20,
    ratio: Number(env('RATIO')) || 3,
    riskSum: Number(env('RISK_SUM')) || 15,
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
