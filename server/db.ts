import { DatabaseSync, backup } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { Expense, Operation, Snapshot, SyncResult, Trip } from '../shared/model.js';

export const migrations = [{ version: 1, sql: `
CREATE TABLE account (id INTEGER PRIMARY KEY CHECK(id=1), email TEXT NOT NULL, password_hash TEXT NOT NULL);
CREATE TABLE sessions (token_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL);
CREATE TABLE trip (id INTEGER PRIMARY KEY CHECK(id=1), name TEXT NOT NULL, start_date TEXT NOT NULL, end_date TEXT NOT NULL, budget_cents INTEGER, version INTEGER NOT NULL);
INSERT INTO trip VALUES (1, 'João Pessoa a dois', '2026-10-17', '2026-10-24', NULL, 1);
CREATE TABLE expenses (id TEXT PRIMARY KEY, description TEXT NOT NULL, amount_cents INTEGER NOT NULL CHECK(amount_cents > 0), category TEXT NOT NULL CHECK(category IN ('passeios','translado','alimentacao','diversos')), date TEXT NOT NULL, note TEXT NOT NULL, version INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0, updated_at TEXT NOT NULL);
CREATE TABLE operations (id TEXT PRIMARY KEY, request TEXT NOT NULL, response TEXT NOT NULL);
` }, { version: 2, sql: `
ALTER TABLE trip ADD COLUMN ticket_budget_cents INTEGER;
ALTER TABLE expenses ADD COLUMN paid_with_ticket INTEGER NOT NULL DEFAULT 0 CHECK(paid_with_ticket IN (0,1) AND (paid_with_ticket=0 OR category='alimentacao'));
` }];
export function openDatabase(path = join(process.env.DATA_DIR || '.data', 'travel.db')) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');
  return migrateDatabase(db);
}
export function migrateDatabase(db: DatabaseSync) {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)');
  for (const migration of migrations) if (!db.prepare('SELECT 1 FROM schema_migrations WHERE version=?').get(migration.version)) {
    db.exec('BEGIN IMMEDIATE');
    try { db.exec(migration.sql); db.prepare('INSERT INTO schema_migrations VALUES (?, ?)').run(migration.version, new Date().toISOString()); db.exec('COMMIT'); }
    catch (error) { db.exec('ROLLBACK'); db.close(); throw error; }
  }
  return db;
}
export type Db = ReturnType<typeof openDatabase>;
export function getTrip(db: Db): Trip {
  const row = db.prepare('SELECT * FROM trip WHERE id=1').get()!;
  return { name: String(row.name), startDate: String(row.start_date), endDate: String(row.end_date), budgetCents: row.budget_cents === null ? null : Number(row.budget_cents), ticketBudgetCents: row.ticket_budget_cents === null ? null : Number(row.ticket_budget_cents), version: Number(row.version) };
}
function expenseFromRow(row: Record<string, unknown>): Expense {
  return { id: String(row.id), description: String(row.description), amountCents: Number(row.amount_cents), category: row.category as Expense['category'], date: String(row.date), note: String(row.note), paidWithTicket: !!row.paid_with_ticket, version: Number(row.version), deleted: !!row.deleted, updatedAt: String(row.updated_at) };
}
export function getExpense(db: Db, id: string): Expense | null { const row = db.prepare('SELECT * FROM expenses WHERE id=?').get(id); return row ? expenseFromRow(row) : null; }
export function snapshot(db: Db): Snapshot { return { trip: getTrip(db), expenses: db.prepare('SELECT * FROM expenses').all().map(expenseFromRow) }; }
export function applyOperation(db: Db, op: Operation): SyncResult {
  db.exec('BEGIN IMMEDIATE');
  try {
    const serialized = JSON.stringify(op);
    const previous = db.prepare('SELECT request,response FROM operations WHERE id=?').get(op.operationId);
    if (previous) {
      if (previous.request !== serialized) throw new Error('OPERATION_ID_REUSED');
      db.exec('COMMIT'); return JSON.parse(String(previous.response)) as SyncResult;
    }
    const current = getExpense(db, op.entityId);
    let result: SyncResult;
    if ((current?.version ?? 0) !== op.expectedVersion || (!current && op.kind === 'delete')) result = { status: 'conflict', current };
    else {
      const input = op.kind === 'delete' ? current! : op.expense!;
      const expense: Expense = { ...input, paidWithTicket: !!input.paidWithTicket, id: op.entityId, deleted: op.kind === 'delete', version: (current?.version ?? 0) + 1, updatedAt: new Date().toISOString() };
      db.prepare(`INSERT INTO expenses (id,description,amount_cents,category,date,note,version,deleted,updated_at,paid_with_ticket) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET description=excluded.description,amount_cents=excluded.amount_cents,category=excluded.category,date=excluded.date,note=excluded.note,version=excluded.version,deleted=excluded.deleted,updated_at=excluded.updated_at,paid_with_ticket=excluded.paid_with_ticket`).run(expense.id, expense.description, expense.amountCents, expense.category, expense.date, expense.note, expense.version, Number(expense.deleted), expense.updatedAt, Number(expense.paidWithTicket));
      result = { status: 'ok', expense };
    }
    db.prepare('INSERT INTO operations VALUES (?,?,?)').run(op.operationId, serialized, JSON.stringify(result));
    db.exec('COMMIT'); return result;
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
export async function backupDatabase(db: Db, directory: string) {
  mkdirSync(directory, { recursive: true });
  const path = join(directory, `travel-${new Date().toISOString().replaceAll(':', '-')}.db`);
  await backup(db, path);
  return path;
}
