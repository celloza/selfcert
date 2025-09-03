import { randomUUID } from 'crypto';
import { getTableClient } from '../azure/tableClient.js';

export interface AuditEvent {
  id: string;
  ts: string; // ISO timestamp
  actor: string;
  action: string;
  targetType?: string;
  targetId?: string;
  details?: any;
}

const tableName = process.env.AUDIT_TABLE_NAME;
const mem: AuditEvent[] = [];

export async function record(event: Omit<AuditEvent, 'id' | 'ts'>) {
  const e: AuditEvent = { id: randomUUID(), ts: new Date().toISOString(), ...event };
  if (tableName) {
    try {
      const tc = getTableClient(tableName);
      await tc.createEntity({ partitionKey: 'audit', rowKey: e.id, ts: e.ts, actor: e.actor, action: e.action, targetType: e.targetType, targetId: e.targetId, details: JSON.stringify(e.details ?? {}) });
    } catch (err) {
      console.error('audit persistence failed, using memory fallback', err);
      mem.push(e);
    }
  } else {
    mem.push(e);
  }
  return e;
}

export interface AuditQueryOptions {
  limit?: number;
  cursor?: string;
  user?: string;
  name?: string;
  sort?: string;
  dir?: string;
}

export interface AuditQueryResult {
  items: AuditEvent[];
  nextCursor?: string;
}

export async function query(opts: AuditQueryOptions = {}): Promise<AuditQueryResult> {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  let events: AuditEvent[] = [];
  if (tableName) {
    try {
      const tc = getTableClient(tableName);
      for await (const ent of tc.listEntities({ queryOptions: { filter: "PartitionKey eq 'audit'" } })) {
        let details: any;
        try { details = ent.details ? JSON.parse(ent.details as string) : undefined; } catch { details = undefined; }
        events.push({ id: ent.rowKey as string, ts: ent.ts as string, actor: ent.actor as string, action: ent.action as string, targetType: ent.targetType as string | undefined, targetId: ent.targetId as string | undefined, details });
      }
    } catch (err) {
      console.error('audit query failed, memory only', err);
      events = [...mem];
    }
  } else {
    events = [...mem];
  }
  let ordered = events;
  if (opts.user) ordered = ordered.filter(e => e.actor === opts.user);
  if (opts.name) {
    const term = opts.name.toLowerCase();
    ordered = ordered.filter(e => typeof e.details?.displayName === 'string' && e.details.displayName.toLowerCase().includes(term));
  }
  const sortField = opts.sort || 'ts';
  const dir = opts.dir === 'asc' ? 1 : -1;
  ordered = [...ordered].sort((a, b) => {
    const av = (a as any)[sortField] || '';
    const bv = (b as any)[sortField] || '';
    if (av < bv) return -1 * dir;
    if (av > bv) return 1 * dir;
    return 0;
  });
  if (sortField === 'ts' && dir === -1) { /* same as original desc default */ }

  let startIndex = 0;
  if (opts.cursor) {
    const idx = ordered.findIndex(e => e.id === opts.cursor);
    if (idx >= 0) startIndex = idx + 1;
  }
  const page = ordered.slice(startIndex, startIndex + limit);
  const nextExists = ordered.length > startIndex + page.length;
  return { items: page, nextCursor: nextExists ? page[page.length - 1].id : undefined };
}
