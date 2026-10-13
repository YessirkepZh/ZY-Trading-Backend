import { existsSync, readFileSync } from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Env variable → location in config/conf.json
const FILE_KEYS: Record<string, [section: string, key: string]> = {
  PORT:                  ['http', 'port'],
  NODE_ENV:              ['http', 'environment'],
  CORS_ORIGINS:          ['http', 'cors_origins'],
  JWT_SECRET:            ['auth', 'jwt_secret'],
  DATABASE_URL:          ['postgres', 'connection_url'],
  BOT_ENABLED:           ['telegram', 'enabled'],
  TELEGRAM_TOKEN:        ['telegram', 'token'],
  ALLOWED_USERS:         ['telegram', 'allowed_users'],
  ANTHROPIC_API_KEY:     ['anthropic', 'api_key'],
  TWELVE_DATA_API_KEY:   ['market', 'twelve_data_api_key'],
  POLYGON_API_KEY:       ['market', 'polygon_api_key'],
  CRYPTOCOMPARE_API_KEY: ['market', 'cryptocompare_api_key'],
  R2_ACCOUNT_ID:         ['r2', 'account_id'],
  R2_ACCESS_KEY_ID:      ['r2', 'access_key_id'],
  R2_SECRET_ACCESS_KEY:  ['r2', 'secret_access_key'],
  R2_BUCKET_NAME:        ['r2', 'bucket_name'],
  R2_PUBLIC_URL:         ['r2', 'public_url'],
  RISK_CRYPTO_DEFAULT:   ['risk', 'crypto_default'],
  LUFT_PERCENT:          ['risk', 'luft_percent'],
  RATIO:                 ['risk', 'ratio'],
  RISK_SUM:              ['risk', 'risk_sum'],
};

type ConfFile = Record<string, Record<string, unknown> | undefined>;

function parseConf(raw: string, source: string): ConfFile {
  try {
    return JSON.parse(raw) as ConfFile;
  } catch (err) {
    throw new Error(`Invalid config in ${source}: ${err instanceof Error ? err.message : err}`);
  }
}

/** CONF_JSON variable (hosting without files, e.g. Railway) or config/conf.json */
function loadConf(): { file: ConfFile; source: string } | null {
  const inline = process.env['CONF_JSON']?.trim();
  if (inline) return { file: parseConf(inline, 'CONF_JSON'), source: 'CONF_JSON' };

  const filePath = path.resolve(process.env['CONFIG_PATH'] ?? 'config/conf.json');
  if (!existsSync(filePath)) return null;
  return { file: parseConf(readFileSync(filePath, 'utf8'), filePath), source: filePath };
}

function stringify(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (Array.isArray(value)) return value.join(',');
  return String(value);
}

const loaded = loadConf();
if (loaded) {
  console.log(`Config loaded from ${loaded.source}`);
} else {
  // Without a config, settings come from separate env variables, optionally via .env
  dotenv.config();
}

/** Separate environment variable first, then CONF_JSON / config/conf.json */
export function env(key: string): string | undefined {
  const fromEnv = process.env[key];
  if (fromEnv !== undefined && fromEnv !== '') return fromEnv;

  const location = FILE_KEYS[key];
  if (!loaded || !location) return undefined;
  const [section, field] = location;
  return stringify(loaded.file[section]?.[field]);
}
