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

  bybit: {
    apiKey: process.env['BYBIT_API_KEY'] || '',
    apiSecret: process.env['BYBIT_API_SECRET'] || '',
  },

  polygon: {
    apiKey: required('POLYGON_API_KEY'),
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
} as const;
