import type { Strategy } from '../types/deal';
import { proboyChecklist } from './proboyChecklist';
import { falseProboyChecklist } from './falseProboyChecklist';
import { otboyChecklist } from './otboyChecklist';

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

const checklistMap: Record<Strategy, Checklist> = {
  'Пробой': proboyChecklist,
  'Ложный Пробой': falseProboyChecklist,
  'Отбой': otboyChecklist,
};

export function getChecklistForStrategy(strategy: Strategy): Checklist {
  return checklistMap[strategy];
}

export function getLabelByKey(strategy: Strategy, key: string): string {
  const checklist = checklistMap[strategy];
  const allItems = [
    ...checklist.ПРЕДПОСЫЛКИ,
    ...checklist.МИНУСЫ,
    ...checklist.ОЖИДАЮ,
  ];
  return allItems.find((item) => item.key === key)?.label ?? key;
}
