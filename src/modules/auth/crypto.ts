import { createHash, createHmac, randomBytes, scrypt, timingSafeEqual } from 'crypto';
import type { UserRole } from './types';

// ── Passwords (scrypt) ────────────────────────────────────────────────────────

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_KEY_LEN = 64;

function deriveKey(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, SCRYPT_KEY_LEN, { N: n, r, p }, (err, key) => {
      if (err) reject(err);
      else resolve(key);
    });
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await deriveKey(password, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P);
  return ['scrypt', SCRYPT_N, SCRYPT_R, SCRYPT_P, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algo, n, r, p, salt, hash] = stored.split('$');
  if (algo !== 'scrypt' || !n || !r || !p || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64');
  const key = await deriveKey(password, Buffer.from(salt, 'base64'), Number(n), Number(r), Number(p));
  return key.length === expected.length && timingSafeEqual(key, expected);
}

// ── Opaque tokens (refresh, API, invite) ──────────────────────────────────────

export function generateToken(prefix: string): string {
  return `${prefix}${randomBytes(32).toString('base64url')}`;
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

// ── Access token (JWT HS256) ──────────────────────────────────────────────────

export interface AccessTokenPayload {
  sub: number;
  role: UserRole;
  iat: number;
  exp: number;
}

// Fixed header — tokens with any other alg are rejected
const JWT_HEADER = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');

function sign(data: string, secret: string): Buffer {
  return createHmac('sha256', secret).update(data).digest();
}

export function signAccessToken(
  user: { id: number; role: UserRole },
  secret: string,
  ttlSec: number,
): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: AccessTokenPayload = { sub: user.id, role: user.role, iat: now, exp: now + ttlSec };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = sign(`${JWT_HEADER}.${body}`, secret).toString('base64url');
  return `${JWT_HEADER}.${body}.${signature}`;
}

export function verifyAccessToken(token: string, secret: string): AccessTokenPayload | null {
  const [header, body, signature] = token.split('.');
  if (header !== JWT_HEADER || !body || !signature) return null;

  const expected = sign(`${header}.${body}`, secret);
  const given = Buffer.from(signature, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;

  let payload: Partial<AccessTokenPayload>;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Partial<AccessTokenPayload>;
  } catch {
    return null;
  }

  if (typeof payload.sub !== 'number' || typeof payload.exp !== 'number') return null;
  if (payload.exp <= Math.floor(Date.now() / 1000)) return null;
  return payload as AccessTokenPayload;
}
