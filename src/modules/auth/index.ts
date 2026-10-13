import type { FastifyInstance } from 'fastify';
import { registerAuthGuard } from './guard';
import { registerAuthRoutes } from './routes';
import type { AuthHooks } from './types';

export function registerAuth(fastify: FastifyInstance, hooks: AuthHooks): void {
  registerAuthGuard(fastify);
  registerAuthRoutes(fastify, hooks);
}

export { currentUser } from './guard';
export { findOwner, findUserById, findUserByTelegramId, setupOwner, MIN_PASSWORD_LENGTH } from './authService';
export type { AuthHooks, AuthUser, UserRole } from './types';
