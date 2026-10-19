export interface RiskPreset {
  id: number;
  userId: number;
  name: string;
  riskPercent: number;
  ratio: number;
  luftPercent: number;
  riskSum: number;
  isSystem: boolean;
  isDefault: boolean;
  archivedAt: Date | null;
}

export interface StrategyRow {
  id: number;
  userId: number;
  name: string;
  slug: string;
  position: number;
  isSystem: boolean;
  defaultRiskPresetId: number | null;
  archivedAt: Date | null;
  /** Joined when listing */
  defaultRiskPreset?: RiskPreset | null;
}

export interface CreateRiskPresetInput {
  name: string;
  riskPercent: number;
  ratio: number;
  luftPercent: number;
  riskSum: number;
  isDefault?: boolean;
}

export interface UpdateRiskPresetInput {
  name?: string;
  riskPercent?: number;
  ratio?: number;
  luftPercent?: number;
  riskSum?: number;
  isDefault?: boolean;
}

export interface CreateStrategyInput {
  name: string;
  defaultRiskPresetId?: number | null;
  position?: number;
}

export interface UpdateStrategyInput {
  /** Forbidden for is_system strategies */
  name?: string;
  defaultRiskPresetId?: number | null;
  position?: number;
}
