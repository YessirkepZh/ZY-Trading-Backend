import { pool } from '../../db/pool';
import type { ApiTokenInfo, AuthUser, InviteInfo, UserRole } from './types';

interface UserRow {
  id: number;
  email: string;
  password_hash: string | null;
  role: UserRole;
  telegram_id: string | null;
  is_active: boolean;
}

export interface UserWithPassword extends AuthUser {
  passwordHash: string | null;
}

function mapUser(row: UserRow): UserWithPassword {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    telegramId: row.telegram_id != null ? Number(row.telegram_id) : null,
    passwordHash: row.password_hash,
  };
}

function toAuthUser(user: UserWithPassword): AuthUser {
  const { passwordHash: _omit, ...rest } = user;
  return rest;
}

// ── Users ─────────────────────────────────────────────────────────────────────

export async function findActiveUserById(id: number): Promise<AuthUser | null> {
  const { rows } = await pool.query<UserRow>(
    'SELECT * FROM users WHERE id = $1 AND is_active = TRUE',
    [id],
  );
  return rows[0] ? toAuthUser(mapUser(rows[0])) : null;
}

export async function findActiveUserByEmail(email: string): Promise<UserWithPassword | null> {
  const { rows } = await pool.query<UserRow>(
    'SELECT * FROM users WHERE email = $1 AND is_active = TRUE',
    [email],
  );
  return rows[0] ? mapUser(rows[0]) : null;
}

export async function findActiveUserByTelegramId(telegramId: number): Promise<AuthUser | null> {
  const { rows } = await pool.query<UserRow>(
    'SELECT * FROM users WHERE telegram_id = $1 AND is_active = TRUE',
    [telegramId],
  );
  return rows[0] ? toAuthUser(mapUser(rows[0])) : null;
}

/** First admin — owns data created before multi-user support */
export async function findOwner(): Promise<AuthUser | null> {
  const { rows } = await pool.query<UserRow>(
    `SELECT * FROM users WHERE role = 'admin' AND is_active = TRUE ORDER BY id LIMIT 1`,
  );
  return rows[0] ? toAuthUser(mapUser(rows[0])) : null;
}

export async function updateOwnerCredentials(params: {
  email: string;
  passwordHash: string;
  telegramId: number | null;
}): Promise<AuthUser> {
  const { rows } = await pool.query<UserRow>(
    `UPDATE users
     SET email = $1, password_hash = $2, telegram_id = COALESCE($3, telegram_id), updated_at = NOW()
     WHERE id = (SELECT id FROM users WHERE role = 'admin' ORDER BY id LIMIT 1)
     RETURNING *`,
    [params.email, params.passwordHash, params.telegramId],
  );
  const row = rows[0];
  if (!row) throw new Error('updateOwnerCredentials: owner not found, run migrations first');
  return toAuthUser(mapUser(row));
}

// ── Refresh tokens ────────────────────────────────────────────────────────────

export async function insertRefreshToken(userId: number, tokenHash: string, expiresAt: Date): Promise<void> {
  await pool.query(
    'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES ($1, $2, $3)',
    [userId, tokenHash, expiresAt],
  );
}

/** Revokes a valid token and returns its owner; null if token is unknown, expired or already used */
export async function consumeRefreshToken(tokenHash: string): Promise<number | null> {
  const { rows } = await pool.query<{ user_id: number }>(
    `UPDATE refresh_tokens SET revoked_at = NOW()
     WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > NOW()
     RETURNING user_id`,
    [tokenHash],
  );
  return rows[0]?.user_id ?? null;
}

export async function findRevokedRefreshTokenOwner(tokenHash: string): Promise<number | null> {
  const { rows } = await pool.query<{ user_id: number }>(
    'SELECT user_id FROM refresh_tokens WHERE token_hash = $1 AND revoked_at IS NOT NULL',
    [tokenHash],
  );
  return rows[0]?.user_id ?? null;
}

export async function revokeRefreshToken(tokenHash: string): Promise<void> {
  await pool.query(
    'UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL',
    [tokenHash],
  );
}

export async function revokeAllRefreshTokens(userId: number): Promise<void> {
  await pool.query(
    'UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL',
    [userId],
  );
}

// ── API tokens ────────────────────────────────────────────────────────────────

interface ApiTokenRow {
  id: number;
  name: string;
  token_prefix: string;
  last_used_at: Date | null;
  created_at: Date;
}

function mapApiToken(row: ApiTokenRow): ApiTokenInfo {
  return {
    id: row.id,
    name: row.name,
    tokenPrefix: row.token_prefix,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
  };
}

export async function insertApiToken(params: {
  userId: number;
  name: string;
  tokenHash: string;
  tokenPrefix: string;
}): Promise<ApiTokenInfo> {
  const { rows } = await pool.query<ApiTokenRow>(
    `INSERT INTO api_tokens (user_id, name, token_hash, token_prefix)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name, token_prefix, last_used_at, created_at`,
    [params.userId, params.name, params.tokenHash, params.tokenPrefix],
  );
  const row = rows[0];
  if (!row) throw new Error('insertApiToken: no row returned');
  return mapApiToken(row);
}

export async function listApiTokens(userId: number): Promise<ApiTokenInfo[]> {
  const { rows } = await pool.query<ApiTokenRow>(
    `SELECT id, name, token_prefix, last_used_at, created_at FROM api_tokens
     WHERE user_id = $1 AND revoked_at IS NULL
     ORDER BY created_at DESC`,
    [userId],
  );
  return rows.map(mapApiToken);
}

export async function revokeApiToken(userId: number, id: number): Promise<boolean> {
  const result = await pool.query(
    'UPDATE api_tokens SET revoked_at = NOW() WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL',
    [id, userId],
  );
  return (result.rowCount ?? 0) > 0;
}

export async function findUserByApiTokenHash(tokenHash: string): Promise<AuthUser | null> {
  const { rows } = await pool.query<UserRow>(
    `UPDATE api_tokens t SET last_used_at = NOW()
     FROM users u
     WHERE t.token_hash = $1 AND t.revoked_at IS NULL
       AND u.id = t.user_id AND u.is_active = TRUE
     RETURNING u.*`,
    [tokenHash],
  );
  return rows[0] ? toAuthUser(mapUser(rows[0])) : null;
}

// ── Invites ───────────────────────────────────────────────────────────────────

interface InviteRow {
  id: number;
  email: string | null;
  role: UserRole;
  created_by: number;
  expires_at: Date;
  used_at: Date | null;
  created_at: Date;
}

function mapInvite(row: InviteRow): InviteInfo {
  return {
    id: row.id,
    email: row.email,
    role: row.role,
    expiresAt: row.expires_at,
    usedAt: row.used_at,
    createdAt: row.created_at,
  };
}

export async function insertInvite(params: {
  tokenHash: string;
  email: string | null;
  role: UserRole;
  createdBy: number;
  expiresAt: Date;
}): Promise<InviteInfo> {
  const { rows } = await pool.query<InviteRow>(
    `INSERT INTO invites (token_hash, email, role, created_by, expires_at)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING *`,
    [params.tokenHash, params.email, params.role, params.createdBy, params.expiresAt],
  );
  const row = rows[0];
  if (!row) throw new Error('insertInvite: no row returned');
  return mapInvite(row);
}

export async function listInvites(): Promise<InviteInfo[]> {
  const { rows } = await pool.query<InviteRow>(
    'SELECT * FROM invites ORDER BY created_at DESC LIMIT 100',
  );
  return rows.map(mapInvite);
}

export type AcceptInviteResult =
  | { status: 'ok'; user: AuthUser; invitedBy: number }
  | { status: 'invalid_invite' | 'email_mismatch' | 'email_taken' };

/** Creates the user and marks the invite used in one transaction */
export async function acceptInvite(params: {
  tokenHash: string;
  email: string;
  passwordHash: string;
}): Promise<AcceptInviteResult> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows: invites } = await client.query<InviteRow>(
      `SELECT * FROM invites
       WHERE token_hash = $1 AND used_at IS NULL AND expires_at > NOW()
       FOR UPDATE`,
      [params.tokenHash],
    );
    const invite = invites[0];
    if (!invite) {
      await client.query('ROLLBACK');
      return { status: 'invalid_invite' };
    }
    if (invite.email && invite.email !== params.email) {
      await client.query('ROLLBACK');
      return { status: 'email_mismatch' };
    }

    const { rows: users } = await client.query<UserRow>(
      `INSERT INTO users (email, password_hash, role) VALUES ($1, $2, $3)
       ON CONFLICT (email) DO NOTHING
       RETURNING *`,
      [params.email, params.passwordHash, invite.role],
    );
    const userRow = users[0];
    if (!userRow) {
      await client.query('ROLLBACK');
      return { status: 'email_taken' };
    }

    await client.query(
      'UPDATE invites SET used_at = NOW(), used_by = $2 WHERE id = $1',
      [invite.id, userRow.id],
    );
    await client.query('COMMIT');

    return { status: 'ok', user: toAuthUser(mapUser(userRow)), invitedBy: invite.created_by };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
