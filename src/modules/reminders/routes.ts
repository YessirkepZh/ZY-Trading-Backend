import type { FastifyInstance } from 'fastify';
import { runRemindersHandler } from './handlers/runReminders';

export function registerReminderRoutes(fastify: FastifyInstance): void {
  fastify.post('/api/internal/reminders', runRemindersHandler);
}
