import type { Strategy } from '../types/deal';
import * as checklistItemService from '../services/checklistItemService';

export type ChecklistItemType = 'plus' | 'minus' | 'wait';

export interface ChecklistItem {
  key: string;
  label: string;
}

export interface Checklist {
  ПРЕДПОСЫЛКИ: ChecklistItem[];
  МИНУСЫ: ChecklistItem[];
  ОЖИДАЮ: ChecklistItem[];
}

export function getChecklistForStrategy(strategy: Strategy): Checklist {
  return checklistItemService.getChecklistForStrategy(strategy);
}

export function getLabelByKey(strategy: Strategy, key: string): string {
  return checklistItemService.getLabelByKey(strategy, key);
}
