import type { Strategy } from '../types/deal';
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
export declare function getChecklistForStrategy(strategy: Strategy): Checklist;
export declare function getLabelByKey(strategy: Strategy, key: string): string;
