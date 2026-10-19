export { registerTradingSettingsRoutes } from './routes';
export {
  forkDefaultsForUser,
  listStrategies,
  listRiskPresets,
  resolveRiskForDeal,
  getDefaultRiskPreset,
  getStrategyByName,
} from './tradingSettingsService';
export type { RiskPreset, StrategyRow } from './types';
