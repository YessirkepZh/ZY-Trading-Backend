import type { FastifyInstance } from 'fastify';
import {
  archiveRiskPresetHandler,
  createRiskPresetHandler,
  listRiskPresetsHandler,
  updateRiskPresetHandler,
} from './handlers/riskPresets';
import {
  archiveStrategyHandler,
  createStrategyHandler,
  listStrategiesHandler,
  updateStrategyHandler,
} from './handlers/strategies';

export function registerTradingSettingsRoutes(fastify: FastifyInstance): void {
  fastify.get('/api/risk-presets', listRiskPresetsHandler);
  fastify.post('/api/risk-presets', createRiskPresetHandler);
  fastify.patch<{ Params: { id: string } }>('/api/risk-presets/:id', updateRiskPresetHandler);
  fastify.delete<{ Params: { id: string } }>('/api/risk-presets/:id', archiveRiskPresetHandler);

  fastify.get('/api/strategies', listStrategiesHandler);
  fastify.post('/api/strategies', createStrategyHandler);
  fastify.patch<{ Params: { id: string } }>('/api/strategies/:id', updateStrategyHandler);
  fastify.delete<{ Params: { id: string } }>('/api/strategies/:id', archiveStrategyHandler);
}
