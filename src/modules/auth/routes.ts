import type { FastifyInstance } from 'fastify';
import type { AuthHooks } from './types';
import { loginHandler, logoutHandler, meHandler, refreshHandler } from './handlers/session';
import { createApiTokenHandler, listApiTokensHandler, revokeApiTokenHandler } from './handlers/apiTokens';
import { acceptInviteHandler, createInviteHandler, listInvitesHandler } from './handlers/invites';

export function registerAuthRoutes(fastify: FastifyInstance, hooks: AuthHooks): void {
  fastify.post('/api/auth/login', loginHandler);
  fastify.post('/api/auth/refresh', refreshHandler);
  fastify.post('/api/auth/logout', logoutHandler);
  fastify.get('/api/auth/me', meHandler);

  fastify.get('/api/auth/api-tokens', listApiTokensHandler);
  fastify.post('/api/auth/api-tokens', createApiTokenHandler);
  fastify.delete<{ Params: { id: string } }>('/api/auth/api-tokens/:id', revokeApiTokenHandler);

  fastify.get('/api/auth/invites', listInvitesHandler);
  fastify.post('/api/auth/invites', createInviteHandler);
  fastify.post('/api/auth/invites/accept', acceptInviteHandler(hooks));
}
