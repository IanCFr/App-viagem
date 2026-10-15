import Dexie, { type Table } from 'dexie';
import type { Expense, ExpenseInput, Operation, Snapshot, SyncResult, Trip } from '../shared/model';

export type Pending = Operation & { seq?: number; conflict?: { current: Expense | null } };
export type LocalState = { trip: Trip | null; expenses: Expense[]; pending: Pending[]; lastSync: string | null; email: string | null };
export class TravelStore extends Dexie {
  records!: Table<Expense, string>;
  pending!: Table<Pending, number>;
  meta!: Table<{ key: string; value: unknown }, string>;
  constructor(name = 'joao-pessoa-a-dois') {
    super(name);
    this.version(1).stores({ records: 'id', pending: '++seq,entityId', meta: 'key' });
  }
}
export function project(records: Expense[], pending: Pending[]) {
  const rows = new Map(records.map(e => [e.id, e]));
  for (const op of pending) {
    const existing = rows.get(op.entityId);
    const content = op.kind === 'delete' ? existing : op.expense;
    if (content) rows.set(op.entityId, { ...content, id: op.entityId, version: op.expectedVersion + 1, deleted: op.kind === 'delete', updatedAt: existing?.updatedAt ?? new Date().toISOString() });
  }
  return [...rows.values()];
}
export async function readState(db: TravelStore): Promise<LocalState> {
  return db.transaction('r', [db.records, db.pending, db.meta], async () => {
    const pending = await db.pending.orderBy('seq').toArray();
    const meta = new Map((await db.meta.toArray()).map(m => [m.key, m.value]));
    return { trip: (meta.get('trip') as Trip) ?? null, email: (meta.get('email') as string) ?? null, lastSync: (meta.get('lastSync') as string) ?? null, pending, expenses: project(await db.records.toArray(), pending) };
  });
}
export async function enqueue(db: TravelStore, id: string, input: ExpenseInput | null) {
  await db.transaction('rw', [db.records, db.pending], async () => {
    const records = await db.records.toArray();
    const pending = await db.pending.orderBy('seq').toArray();
    if (pending.some(op => op.entityId === id && op.conflict)) throw new Error('Resolva o conflito deste gasto antes de alterá-lo.');
    const current = project(records, pending).find(e => e.id === id);
    if (!input && !current) return;
    await db.pending.add({ operationId: crypto.randomUUID(), entityId: id, expectedVersion: current?.version ?? 0, kind: input ? 'upsert' : 'delete', ...(input ? { expense: input } : {}) });
  });
}
export type Transport = { send: (op: Operation) => Promise<SyncResult>; snapshot: () => Promise<Snapshot> };
export async function synchronize(db: TravelStore, transport: Transport) {
  const pending = await db.pending.orderBy('seq').toArray();
  const blocked = new Set(pending.filter(op => op.conflict).map(op => op.entityId));
  for (const queued of pending) {
    if (blocked.has(queued.entityId)) continue;
    // Outra aba pode ter confirmado a operação enquanto esta aguardava o lock.
    const op = await db.pending.get(queued.seq!);
    if (!op) continue;
    const { seq, conflict: _conflict, ...wire } = op;
    const result = await transport.send(wire);
    await db.transaction('rw', [db.records, db.pending], async () => {
      if (result.status === 'ok') {
        const cached = await db.records.get(result.expense.id);
        if (!cached || cached.version <= result.expense.version) await db.records.put(result.expense);
        await db.pending.delete(seq!);
      } else {
        await db.pending.update(seq!, { conflict: { current: result.current } });
        blocked.add(op.entityId);
      }
    });
  }
  const remote = await transport.snapshot();
  await db.transaction('rw', [db.records, db.meta], async () => {
    await db.records.clear(); await db.records.bulkPut(remote.expenses);
    await db.meta.bulkPut([{ key: 'trip', value: remote.trip }, { key: 'lastSync', value: new Date().toISOString() }]);
  });
}
export async function resolveConflict(db: TravelStore, entityId: string, choice: 'local' | 'remote') {
  await db.transaction('rw', [db.records, db.pending], async () => {
    const operations = await db.pending.orderBy('seq').toArray();
    const conflict = operations.find(op => op.entityId === entityId && op.conflict);
    if (!conflict) return;
    const records = await db.records.toArray();
    const local = project(records, operations).find(e => e.id === entityId);
    const cached = records.find(e => e.id === entityId);
    const reported = conflict.conflict!.current;
    const remote = cached && cached.version >= (reported?.version ?? 0) ? cached : reported;
    await db.pending.where('entityId').equals(entityId).delete();
    if (remote) await db.records.put(remote); else await db.records.delete(entityId);
    if (choice === 'local' && local && !(local.deleted && (!remote || remote.deleted))) {
      const { id: _id, version: _version, updatedAt: _updatedAt, deleted, ...expense } = local;
      await db.pending.add({ operationId: crypto.randomUUID(), entityId, expectedVersion: remote?.version ?? 0, kind: deleted ? 'delete' : 'upsert', ...(!deleted ? { expense } : {}) });
    }
  });
}
