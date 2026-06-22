import { pool } from '../db/pool';
import type { Strategy } from '../types/deal';

export type ItemType = 'plus' | 'minus' | 'wait';

// ── DB row types ──────────────────────────────────────────────────────────────

interface GroupRow {
  id: number;
  name: string;
  position: number;
  created_at: Date;
  updated_at: Date;
}

interface ItemRow {
  id: number;
  group_id: number;
  strategy: string;
  item_type: ItemType;
  key: string;
  label: string;
  position: number;
  created_at: Date;
  updated_at: Date;
}

// ── Public types ──────────────────────────────────────────────────────────────

export interface ChecklistGroup {
  id: number;
  name: string;
  position: number;
}

export interface ChecklistItemPublic {
  id: number;
  groupId: number;
  strategy: string;
  itemType: ItemType;
  key: string;
  label: string;
  position: number;
}

export interface ChecklistGroupWithItems extends ChecklistGroup {
  items: ChecklistItemPublic[];
}

export interface CreateGroupInput {
  name: string;
  position?: number;
}

export interface UpdateGroupInput {
  name?: string;
  position?: number;
}

export interface CreateChecklistItemInput {
  groupId: number;
  itemType: ItemType;
  key: string;
  label: string;
  position?: number;
}

export interface UpdateChecklistItemInput {
  label?: string;
  position?: number;
}

// ── In-memory cache ───────────────────────────────────────────────────────────

let cachedGroups: ChecklistGroup[] = [];
let cachedItems: ChecklistItemPublic[] = [];

function mapGroup(row: GroupRow): ChecklistGroup {
  return { id: row.id, name: row.name, position: row.position };
}

function mapItem(row: ItemRow): ChecklistItemPublic {
  return {
    id: row.id,
    groupId: row.group_id,
    strategy: row.strategy,
    itemType: row.item_type,
    key: row.key,
    label: row.label,
    position: row.position,
  };
}

async function loadCache(): Promise<void> {
  const [groupsResult, itemsResult] = await Promise.all([
    pool.query<GroupRow>(`SELECT * FROM checklist_groups ORDER BY position, id`),
    pool.query<ItemRow>(`SELECT * FROM checklist_items ORDER BY group_id, item_type, position, id`),
  ]);
  cachedGroups = groupsResult.rows.map(mapGroup);
  cachedItems = itemsResult.rows.map(mapItem);
}

export async function initChecklistCache(): Promise<void> {
  await loadCache();
}

function refreshCache(): void {
  loadCache().catch((err) =>
    console.error('[checklistItemService] cache refresh failed:', err),
  );
}

// ── Sync accessors (use cache) ────────────────────────────────────────────────

export function getLabelByKey(strategy: Strategy, key: string): string {
  const item = cachedItems.find((i) => i.strategy === strategy && i.key === key);
  return item?.label ?? key;
}

export interface CachedChecklist {
  ПРЕДПОСЫЛКИ: Array<{ key: string; label: string }>;
  МИНУСЫ: Array<{ key: string; label: string }>;
  ОЖИДАЮ: Array<{ key: string; label: string }>;
}

export function getChecklistForStrategy(strategy: Strategy): CachedChecklist {
  const items = cachedItems.filter((i) => i.strategy === strategy);
  return {
    ПРЕДПОСЫЛКИ: items.filter((i) => i.itemType === 'plus').map(({ key, label }) => ({ key, label })),
    МИНУСЫ: items.filter((i) => i.itemType === 'minus').map(({ key, label }) => ({ key, label })),
    ОЖИДАЮ: items.filter((i) => i.itemType === 'wait').map(({ key, label }) => ({ key, label })),
  };
}

// ── Async read (cache) ────────────────────────────────────────────────────────

export function getAllGroups(): ChecklistGroup[] {
  return cachedGroups;
}

export function getGroupsWithItems(): ChecklistGroupWithItems[] {
  return cachedGroups.map((g) => ({
    ...g,
    items: cachedItems.filter((i) => i.groupId === g.id),
  }));
}

export function getItemsByGroupId(groupId: number): ChecklistItemPublic[] {
  return cachedItems.filter((i) => i.groupId === groupId);
}

export function getItemsByStrategy(strategy: Strategy): ChecklistItemPublic[] {
  return cachedItems.filter((i) => i.strategy === strategy);
}

export function getAllItems(): ChecklistItemPublic[] {
  return cachedItems;
}

// ── Groups CRUD ───────────────────────────────────────────────────────────────

export async function createGroup(input: CreateGroupInput): Promise<ChecklistGroup> {
  const { name, position = 0 } = input;
  const result = await pool.query<GroupRow>(
    `INSERT INTO checklist_groups (name, position) VALUES ($1, $2) RETURNING *`,
    [name, position],
  );
  const row = result.rows[0];
  if (!row) throw new Error('createGroup: no row returned');
  refreshCache();
  return mapGroup(row);
}

export async function updateGroup(id: number, input: UpdateGroupInput): Promise<ChecklistGroup> {
  const updates: string[] = ['updated_at = NOW()'];
  const values: unknown[] = [id];

  if (input.name !== undefined) {
    values.push(input.name);
    updates.push(`name = $${values.length}`);
  }
  if (input.position !== undefined) {
    values.push(input.position);
    updates.push(`position = $${values.length}`);
  }

  const result = await pool.query<GroupRow>(
    `UPDATE checklist_groups SET ${updates.join(', ')} WHERE id = $1 RETURNING *`,
    values,
  );
  const row = result.rows[0];
  if (!row) throw new Error(`Checklist group #${id} not found`);
  refreshCache();
  return mapGroup(row);
}

export async function deleteGroup(id: number): Promise<void> {
  const result = await pool.query(`DELETE FROM checklist_groups WHERE id = $1`, [id]);
  if (result.rowCount === 0) throw new Error(`Checklist group #${id} not found`);
  refreshCache();
}

// ── Items CRUD ────────────────────────────────────────────────────────────────

export async function createItem(input: CreateChecklistItemInput): Promise<ChecklistItemPublic> {
  const { groupId, itemType, key, label, position = 0 } = input;

  // Resolve strategy name from group
  const group = cachedGroups.find((g) => g.id === groupId);
  if (!group) throw new Error(`Checklist group #${groupId} not found`);

  const result = await pool.query<ItemRow>(
    `INSERT INTO checklist_items (group_id, strategy, item_type, key, label, position)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [groupId, group.name, itemType, key, label, position],
  );
  const row = result.rows[0];
  if (!row) throw new Error('createItem: no row returned');
  refreshCache();
  return mapItem(row);
}

export async function updateItem(
  id: number,
  input: UpdateChecklistItemInput,
): Promise<ChecklistItemPublic> {
  const updates: string[] = ['updated_at = NOW()'];
  const values: unknown[] = [id];

  if (input.label !== undefined) {
    values.push(input.label);
    updates.push(`label = $${values.length}`);
  }
  if (input.position !== undefined) {
    values.push(input.position);
    updates.push(`position = $${values.length}`);
  }

  const result = await pool.query<ItemRow>(
    `UPDATE checklist_items SET ${updates.join(', ')} WHERE id = $1 RETURNING *`,
    values,
  );
  const row = result.rows[0];
  if (!row) throw new Error(`Checklist item #${id} not found`);
  refreshCache();
  return mapItem(row);
}

export async function deleteItem(id: number): Promise<void> {
  const result = await pool.query(`DELETE FROM checklist_items WHERE id = $1`, [id]);
  if (result.rowCount === 0) throw new Error(`Checklist item #${id} not found`);
  refreshCache();
}
