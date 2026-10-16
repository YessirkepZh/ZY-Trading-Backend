import { pool } from '../../db/pool';
import type { Strategy } from '../../shared/trading';

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
  user_id: number;
  group_id: number;
  strategy: string;
  item_type: ItemType;
  key: string;
  label: string;
  description: string | null;
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
  /** Longer explanation for Claude; absent when the trader left it empty */
  description?: string;
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
  description?: string;
  position?: number;
}

export interface UpdateChecklistItemInput {
  label?: string;
  /** null clears a previously saved description */
  description?: string | null;
  position?: number;
}

// ── In-memory cache ───────────────────────────────────────────────────────────

// Groups are the shared strategies; items belong to a user
let cachedGroups: ChecklistGroup[] = [];
let cachedItemsByUser = new Map<number, ChecklistItemPublic[]>();

function mapGroup(row: GroupRow): ChecklistGroup {
  return { id: row.id, name: row.name, position: row.position };
}

function mapItem(row: ItemRow): ChecklistItemPublic {
  const description = row.description?.trim() || undefined;
  return {
    id: row.id,
    groupId: row.group_id,
    strategy: row.strategy,
    itemType: row.item_type,
    key: row.key,
    label: row.label,
    description,
    position: row.position,
  };
}

async function loadCache(): Promise<void> {
  const [groupsResult, itemsResult] = await Promise.all([
    pool.query<GroupRow>(`SELECT * FROM checklist_groups ORDER BY position, id`),
    pool.query<ItemRow>(`SELECT * FROM checklist_items ORDER BY group_id, item_type, position, id`),
  ]);
  const byUser = new Map<number, ChecklistItemPublic[]>();
  for (const row of itemsResult.rows) {
    const items = byUser.get(row.user_id) ?? [];
    items.push(mapItem(row));
    byUser.set(row.user_id, items);
  }
  cachedGroups = groupsResult.rows.map(mapGroup);
  cachedItemsByUser = byUser;
}

function userItems(userId: number): ChecklistItemPublic[] {
  return cachedItemsByUser.get(userId) ?? [];
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

export function getLabelByKey(userId: number, strategy: Strategy, key: string): string {
  const item = userItems(userId).find((i) => i.strategy === strategy && i.key === key);
  return item?.label ?? key;
}

/** Label plus optional description — what Claude should read for a checked item */
export function formatItemForPrompt(userId: number, strategy: Strategy, key: string): string {
  const item = userItems(userId).find((i) => i.strategy === strategy && i.key === key);
  if (!item) return key;
  return item.description ? `${item.label} — ${item.description}` : item.label;
}

export interface CachedChecklist {
  ПРЕДПОСЫЛКИ: Array<{ key: string; label: string }>;
  МИНУСЫ: Array<{ key: string; label: string }>;
  ОЖИДАЮ: Array<{ key: string; label: string }>;
}

export function getChecklistForStrategy(userId: number, strategy: Strategy): CachedChecklist {
  const items = userItems(userId).filter((i) => i.strategy === strategy);
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

export function getGroupsWithItems(userId: number): ChecklistGroupWithItems[] {
  const items = userItems(userId);
  return cachedGroups.map((g) => ({
    ...g,
    items: items.filter((i) => i.groupId === g.id),
  }));
}

export function getItemsByGroupId(userId: number, groupId: number): ChecklistItemPublic[] {
  return userItems(userId).filter((i) => i.groupId === groupId);
}

export function getItemsByStrategy(userId: number, strategy: Strategy): ChecklistItemPublic[] {
  return userItems(userId).filter((i) => i.strategy === strategy);
}

export function getAllItems(userId: number): ChecklistItemPublic[] {
  return userItems(userId);
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

export async function createItem(
  userId: number,
  input: CreateChecklistItemInput,
): Promise<ChecklistItemPublic> {
  const { groupId, itemType, key, label, description, position = 0 } = input;

  // Resolve strategy name from group
  const group = cachedGroups.find((g) => g.id === groupId);
  if (!group) throw new Error(`Checklist group #${groupId} not found`);

  const result = await pool.query<ItemRow>(
    `INSERT INTO checklist_items (group_id, strategy, item_type, key, label, description, position, user_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [groupId, group.name, itemType, key, label, description?.trim() || null, position, userId],
  );
  const row = result.rows[0];
  if (!row) throw new Error('createItem: no row returned');
  refreshCache();
  return mapItem(row);
}

export async function updateItem(
  userId: number,
  id: number,
  input: UpdateChecklistItemInput,
): Promise<ChecklistItemPublic> {
  const updates: string[] = ['updated_at = NOW()'];
  const values: unknown[] = [id, userId];

  if (input.label !== undefined) {
    values.push(input.label);
    updates.push(`label = $${values.length}`);
  }
  if (input.description !== undefined) {
    values.push(input.description === null ? null : input.description.trim() || null);
    updates.push(`description = $${values.length}`);
  }
  if (input.position !== undefined) {
    values.push(input.position);
    updates.push(`position = $${values.length}`);
  }

  const result = await pool.query<ItemRow>(
    `UPDATE checklist_items SET ${updates.join(', ')} WHERE id = $1 AND user_id = $2 RETURNING *`,
    values,
  );
  const row = result.rows[0];
  if (!row) throw new Error(`Checklist item #${id} not found`);
  refreshCache();
  return mapItem(row);
}

export async function deleteItem(userId: number, id: number): Promise<void> {
  const result = await pool.query(
    `DELETE FROM checklist_items WHERE id = $1 AND user_id = $2`,
    [id, userId],
  );
  if (result.rowCount === 0) throw new Error(`Checklist item #${id} not found`);
  refreshCache();
}

/** Gives a new user their own editable copy of another user's checklist */
export async function copyItems(fromUserId: number, toUserId: number): Promise<void> {
  await pool.query(
    `INSERT INTO checklist_items (group_id, strategy, item_type, key, label, description, position, user_id)
     SELECT group_id, strategy, item_type, key, label, description, position, $2
     FROM checklist_items WHERE user_id = $1
     ON CONFLICT (user_id, strategy, key) DO NOTHING`,
    [fromUserId, toUserId],
  );
  await loadCache();
}
