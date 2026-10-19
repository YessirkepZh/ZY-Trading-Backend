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

const DEFAULT_FRONTEND_URL = 'https://zy-trading-frontend-production.up.railway.app';

export const config = {
  port: Number(env('PORT')) || 3001,
  nodeEnv: env('NODE_ENV') || 'development',
  corsOrigins: parseCorsOrigins(),
  frontendUrl: (env('FRONTEND_URL')?.trim().replace(/\/$/, '') || DEFAULT_FRONTEND_URL),

  /** Railway Cron → Authorization: Bearer <secret> on /api/internal/* */
  cronSecret: env('CRON_SECRET')?.trim() || '',

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
    models: {
      // Setup check runs on every new deal: speed and price matter most
      fast: env('ANTHROPIC_MODEL_FAST') ?? 'claude-haiku-5-5',
      // Post-trade review and period reports: rarer, need deeper reasoning
      smart: env('ANTHROPIC_MODEL_SMART') ?? 'claude-sonnet-5-5',
    },
  },

  /**
   * PG-backed Claude job queue (SKIP LOCKED).
   * CLAUDE_QUEUE_ENABLED=false — disable worker entirely.
   * CLAUDE_WORKER_EMBEDDED=false — API process does not poll; run `npm run worker` separately.
   */
  claudeQueue: {
    enabled: (env('CLAUDE_QUEUE_ENABLED') ?? 'true') !== 'false',
    embedded: (env('CLAUDE_WORKER_EMBEDDED') ?? 'true') !== 'false',
  },

  /**
   * Daily AI quotas per user (UTC day via PG date_trunc). $0 — counts ai_usage_logs + pending jobs.
   * Same caps for admin and user. Set AI_QUOTA_ENABLED=false to disable.
   */
  aiQuota: {
    enabled: (env('AI_QUOTA_ENABLED') ?? 'true') !== 'false',
    dailyCheckSetup: Number(env('AI_QUOTA_DAILY_CHECK_SETUP')) || 40,
    dailyAnalyzeClosed: Number(env('AI_QUOTA_DAILY_ANALYZE_CLOSED')) || 40,
    dailyAnalysisReport: Number(env('AI_QUOTA_DAILY_ANALYSIS_REPORT')) || 5,
    /** 0 = no USD cap; estimate from ai_usage_logs */
    dailyCostUsd: Number(env('AI_QUOTA_DAILY_COST_USD')) || 2,
    /** Burst: createNote / analysis per user per minute */
    burstPerMinute: Number(env('AI_BURST_PER_MINUTE')) || 10,
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
