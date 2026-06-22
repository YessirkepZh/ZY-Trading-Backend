import type { FastifyRequest, FastifyReply } from 'fastify';
import * as svc from '../../services/checklistItemService';
import type { Strategy } from '../../types/deal';

const VALID_STRATEGIES: Strategy[] = ['Пробой', 'Ложный Пробой', 'Отбой'];

/**
 * GET /api/checklist-items          → flat list, all items
 * GET /api/checklist-items?groupId=1 → items for one group
 * GET /api/checklist-items?strategy=Пробой → items for one strategy
 */
export async function getChecklistItemsHandler(
  request: FastifyRequest<{
    Querystring: { groupId?: string; strategy?: string };
  }>,
  reply: FastifyReply,
): Promise<void> {
  const { groupId, strategy } = request.query;

  if (groupId !== undefined) {
    const id = parseInt(groupId, 10);
    if (isNaN(id) || id <= 0) {
      reply.status(400).send({ success: false, error: 'Invalid groupId' });
      return;
    }
    reply.send({ success: true, items: svc.getItemsByGroupId(id) });
    return;
  }

  if (strategy !== undefined) {
    if (!VALID_STRATEGIES.includes(strategy as Strategy)) {
      reply.status(400).send({ success: false, error: `Unknown strategy: ${strategy}` });
      return;
    }
    reply.send({ success: true, items: svc.getItemsByStrategy(strategy as Strategy) });
    return;
  }

  reply.send({ success: true, items: svc.getAllItems() });
}

/**
 * GET /api/checklist
 *
 * For Chrome Extension — returns checklist grouped by strategy.
 * Each item exposes only what the extension needs: groupId, itemType, key, label, position.
 *
 * Response shape:
 * {
 *   "groups": [
 *     {
 *       "id": 1,
 *       "name": "Пробой",
 *       "plus":  [{ "key": "proboy_squeeze", "label": "Поджатие к уровню на малых барах" }, ...],
 *       "minus": [...],
 *       "wait":  [...]
 *     },
 *     ...
 *   ]
 * }
 */
export async function getChecklistForExtensionHandler(
  _request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const groups = svc.getAllGroups();
  const items = svc.getAllItems();

  const result = groups.map((g) => {
    const groupItems = items.filter((i) => i.groupId === g.id);
    return {
      id: g.id,
      name: g.name,
      plus: groupItems
        .filter((i) => i.itemType === 'plus')
        .sort((a, b) => a.position - b.position)
        .map(({ key, label }) => ({ key, label })),
      minus: groupItems
        .filter((i) => i.itemType === 'minus')
        .sort((a, b) => a.position - b.position)
        .map(({ key, label }) => ({ key, label })),
      wait: groupItems
        .filter((i) => i.itemType === 'wait')
        .sort((a, b) => a.position - b.position)
        .map(({ key, label }) => ({ key, label })),
    };
  });

  reply.send({ groups: result });
}
