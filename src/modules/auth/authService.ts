import { config } from '../../config';
import * as repo from './authRepository';
import {
  generateToken,
  hashPassword,
  hashToken,
  signAccessToken,
  verifyAccessToken,
  verifyPassword,
} from './crypto';
import type { ApiTokenInfo, AuthHooks, AuthUser, InviteInfo, UserRole } from './types';

const API_TOKEN_PREFIX = 'zyt_';
const REFRESH_TOKEN_PREFIX = 'zyr_';
const INVITE_TOKEN_PREFIX = 'zyi_';

export const MIN_PASSWORD_LENGTH = 10;

const DUMMY_PASSWORD_HASH = `scrypt$16384$8$1$${'A'.repeat(22)}==$${'A'.repeat(86)}==`;

export interface Session {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
  refreshTtlSec: number;
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function issueSession(user: AuthUser): Promise<Session> {
  const { jwtSecret, accessTokenTtlSec, refreshTokenTtlSec, maxSessionsPerUser } = config.auth;
  const refreshToken = generateToken(REFRESH_TOKEN_PREFIX);
  await repo.insertRefreshToken(
    user.id,
    hashToken(refreshToken),
    new Date(Date.now() + refreshTokenTtlSec * 1000),
  );
  if (user.role !== 'admin') await repo.evictOldRefreshTokens(user.id, maxSessionsPerUser);
  return {
    user,
    accessToken: signAccessToken(user, jwtSecret, accessTokenTtlSec),
    refreshToken,
    refreshTtlSec: refreshTokenTtlSec,
  };
}

// ── Login throttling (per email, process-local) ───────────────────────────────

const MAX_FAILED_LOGINS = 10;
const FAILED_LOGIN_WINDOW_MS = 15 * 60 * 1000;
const failedLogins = new Map<string, { count: number; firstAt: number }>();

function isLoginBlocked(email: string): boolean {
  const entry = failedLogins.get(email);
  if (!entry) return false;
  if (Date.now() - entry.firstAt > FAILED_LOGIN_WINDOW_MS) {
    failedLogins.delete(email);
    return false;
  }
  return entry.count >= MAX_FAILED_LOGINS;
}

function recordFailedLogin(email: string): void {
  const entry = failedLogins.get(email);
  if (!entry || Date.now() - entry.firstAt > FAILED_LOGIN_WINDOW_MS) {
    failedLogins.set(email, { count: 1, firstAt: Date.now() });
    return;
  }
  entry.count++;
}

// ── Sessions ──────────────────────────────────────────────────────────────────

export type LoginResult =
  | { status: 'ok'; session: Session }
  | { status: 'invalid_credentials' | 'too_many_attempts' };

export async function login(rawEmail: string, password: string): Promise<LoginResult> {
  const email = normalizeEmail(rawEmail);
  if (isLoginBlocked(email)) return { status: 'too_many_attempts' };

  const user = await repo.findActiveUserByEmail(email);
  // Unknown emails still pay the scrypt cost so response time does not reveal registered accounts
  const valid = await verifyPassword(password, user?.passwordHash ?? DUMMY_PASSWORD_HASH);
  if (!user?.passwordHash || !valid) {
    recordFailedLogin(email);
    return { status: 'invalid_credentials' };
  }

  failedLogins.delete(email);
  const { passwordHash: _omit, ...authUser } = user;
  return { status: 'ok', session: await issueSession(authUser) };
}

/** Rotates the refresh token. Reuse of a revoked token revokes every session of its owner */
export async function refresh(refreshToken: string): Promise<Session | null> {
  const tokenHash = hashToken(refreshToken);
  const userId = await repo.consumeRefreshToken(tokenHash);

  if (userId === null) {
    const reusedBy = await repo.findRotatedRefreshTokenOwner(tokenHash);
    if (reusedBy !== null) await repo.revokeAllRefreshTokens(reusedBy);
    return null;
  }

  const user = await repo.findActiveUserById(userId);
  return user ? issueSession(user) : null;
}

export async function logout(refreshToken: string): Promise<void> {
  await repo.revokeRefreshToken(hashToken(refreshToken));
}

// ── Request authentication ────────────────────────────────────────────────────

export type AuthResult =
  | { status: 'ok'; user: AuthUser }
  | { status: 'unauthorized' | 'device_required' | 'device_mismatch' };

export async function authenticate(headers: {
  authorization?: string;
  apiKey?: string;
  deviceId?: string;
}): Promise<AuthResult> {
  const bearer = headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  if (bearer) {
    const payload = verifyAccessToken(bearer, config.auth.jwtSecret);
    const user = payload ? await repo.findActiveUserById(payload.sub) : null;
    return user ? { status: 'ok', user } : { status: 'unauthorized' };
  }

  const apiKey = headers.apiKey;
  if (!apiKey?.startsWith(API_TOKEN_PREFIX)) return { status: 'unauthorized' };
  const found = await repo.findApiTokenOwner(hashToken(apiKey));
  if (!found) return { status: 'unauthorized' };

  // Admin tokens are not bound to a device
  if (found.user.role === 'admin') {
    await repo.useApiToken(found.tokenId, null);
    return { status: 'ok', user: found.user };
  }
  if (!headers.deviceId) return { status: 'device_required' };
  const bound = await repo.useApiToken(found.tokenId, headers.deviceId);
  return bound ? { status: 'ok', user: found.user } : { status: 'device_mismatch' };
}

// ── API tokens ────────────────────────────────────────────────────────────────

/** Non-admin users keep a single active token: a new one revokes the previous */
export async function createApiToken(
  user: AuthUser,
  name: string,
): Promise<{ token: string; info: ApiTokenInfo }> {
  const token = generateToken(API_TOKEN_PREFIX);
  const info = await repo.insertApiToken({
    userId: user.id,
    name,
    tokenHash: hashToken(token),
    tokenPrefix: token.slice(0, API_TOKEN_PREFIX.length + 6),
    replaceExisting: user.role !== 'admin',
  });
  return { token, info };
}

export const listApiTokens = repo.listApiTokens;
export const revokeApiToken = repo.revokeApiToken;

// ── Invites ───────────────────────────────────────────────────────────────────

export async function createInvite(params: {
  createdBy: number;
  email: string | null;
  role: UserRole;
}): Promise<{ token: string; invite: InviteInfo }> {
  const token = generateToken(INVITE_TOKEN_PREFIX);
  const invite = await repo.insertInvite({
    tokenHash: hashToken(token),
    email: params.email ? normalizeEmail(params.email) : null,
    role: params.role,
    createdBy: params.createdBy,
    expiresAt: new Date(Date.now() + config.auth.inviteTtlSec * 1000),
  });
  return { token, invite };
}

export const listInvites = repo.listInvites;

export type AcceptInviteResult =
  | { status: 'ok'; session: Session }
  | { status: 'invalid_invite' | 'email_mismatch' | 'email_taken' };

export async function acceptInvite(
  params: { token: string; email: string; password: string },
  hooks: AuthHooks,
): Promise<AcceptInviteResult> {
  const result = await repo.acceptInvite({
    tokenHash: hashToken(params.token),
    email: normalizeEmail(params.email),
    passwordHash: await hashPassword(params.password),
  });
  if (result.status !== 'ok') return result;

  await hooks.onUserCreated(result.user.id, result.invitedBy);
  return { status: 'ok', session: await issueSession(result.user) };
}

// ── Owner bootstrap ───────────────────────────────────────────────────────────

export async function setupOwner(params: {
  email: string;
  password: string;
  telegramId: number | null;
}): Promise<AuthUser> {
  return repo.updateOwnerCredentials({
    email: normalizeEmail(params.email),
    passwordHash: await hashPassword(params.password),
    telegramId: params.telegramId,
  });
}

export const findUserById = repo.findActiveUserById;
export const findOwner = repo.findOwner;
export const findUserByTelegramId = repo.findActiveUserByTelegramId;
