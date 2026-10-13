export type UserRole = 'admin' | 'user';

export interface AuthUser {
  id: number;
  email: string;
  role: UserRole;
  telegramId: number | null;
}

export interface ApiTokenInfo {
  id: number;
  name: string;
  tokenPrefix: string;
  lastUsedAt: Date | null;
  createdAt: Date;
  deviceBound: boolean;
}

export interface InviteInfo {
  id: number;
  email: string | null;
  role: UserRole;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
}

export interface AuthHooks {
  /** Called after a user joins via invite, e.g. to copy default checklists */
  onUserCreated(userId: number, invitedBy: number): Promise<void>;
}

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser | null;
  }
}
