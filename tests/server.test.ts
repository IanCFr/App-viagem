import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import argon2 from 'argon2';
import { buildApp } from '../server/app.js';
import { applyOperation, backupDatabase, migrateDatabase, migrations, openDatabase, snapshot } from '../server/db.js';
import { operationSchema, type Operation } from '../shared/model.js';

const origin = 'https://viagem.example.test';
const db = openDatabase(':memory:');
const app = await buildApp(db, { origin, production: true });
let cookie = '';
before(async () => {
  db.prepare('INSERT INTO account VALUES (1,?,?)').run('test@example.test', await argon2.hash('only-for-automated-tests', { type: argon2.argon2id }));
  const login = await app.inject({ method: 'POST', url: '/api/login', headers: { origin }, payload: { email: 'test@example.test', password: 'only-for-automated-tests' } });
  cookie = login.cookies[0].name + '=' + login.cookies[0].value;
});
after(async () => { await app.close(); db.close(); });
const operation = (patch: Partial<Operation> = {}): Operation => ({ operationId: crypto.randomUUID(), entityId: crypto.randomUUID(), expectedVersion: 0, kind: 'upsert', expense: { description: 'Passeio de barco', amountCents: 15000, category: 'passeios', date: '2026-10-17', note: '' }, ...patch });
test('API privada e verificação de origem em escritas', async () => {
  assert.equal((await app.inject('/api/trip')).statusCode, 401);
  assert.equal((await app.inject({ method: 'POST', url: '/api/sync', payload: operation(), headers: { cookie, origin: 'https://evil.test' } })).statusCode, 403);
  assert.equal((await app.inject('/api/health')).statusCode, 200);
});
test('login usa cookies protegidos e não retorna senha', async () => {
  const result = await app.inject({ method: 'POST', url: '/api/login', headers: { origin }, payload: { email: 'test@example.test', password: 'only-for-automated-tests' } });
  const header = result.headers['set-cookie'] as string;
  assert.match(header, /HttpOnly/); assert.match(header, /Secure/); assert.match(header, /SameSite=Strict/);
  assert.deepEqual(result.json(), { email: 'test@example.test' });
  assert.equal((await app.inject({ method: 'POST', url: '/api/login', headers: { origin }, payload: { email: 'test@example.test', password: 'wrong' } })).statusCode, 401);
});
test('atualização do orçamento usa versão e preserva centavos', async () => {
  const first = await app.inject({ method: 'PUT', url: '/api/budget', headers: { origin, cookie }, payload: { budgetCents: 500000, expectedVersion: 1 } });
  assert.equal(first.statusCode, 200); assert.equal(first.json().trip.budgetCents, 500000);
  const stale = await app.inject({ method: 'PUT', url: '/api/budget', headers: { origin, cookie }, payload: { budgetCents: 0, expectedVersion: 1 } });
  assert.equal(stale.statusCode, 409);
});
test('reenvio idempotente não duplica gastos nem incrementa versões', async () => {
  const input = operation();
  const first = await app.inject({ method: 'POST', url: '/api/sync', headers: { origin, cookie }, payload: input });
  const retry = await app.inject({ method: 'POST', url: '/api/sync', headers: { origin, cookie }, payload: input });
  assert.equal(first.statusCode, 200); assert.deepEqual(first.json(), retry.json());
  assert.equal(db.prepare('SELECT count(*) AS n FROM expenses WHERE id=?').get(input.entityId)!.n, 1);
  const reused = await app.inject({ method: 'POST', url: '/api/sync', headers: { origin, cookie }, payload: { ...input, expense: { ...input.expense, amountCents: 1 } } });
  assert.equal(reused.statusCode, 409);
});
test('conflitos de edição e exclusão não sobrescrevem a versão remota', () => {
  const input = operationSchema.parse(operation()); applyOperation(db, input);
  const edit = operation({ entityId: input.entityId, expectedVersion: 1, expense: { ...input.expense!, amountCents: 20000 } });
  assert.equal(applyOperation(db, edit).status, 'ok');
  assert.equal(applyOperation(db, operation({ entityId: input.entityId, expectedVersion: 1 })).status, 'conflict');
  const remove = operationSchema.parse({ operationId: crypto.randomUUID(), entityId: input.entityId, expectedVersion: 2, kind: 'delete' });
  assert.equal(applyOperation(db, remove).status, 'ok');
  const stale = applyOperation(db, operation({ entityId: input.entityId, expectedVersion: 2 }));
  assert.equal(stale.status, 'conflict');
  if (stale.status === 'conflict') assert.equal(stale.current!.deleted, true);
});
test('entrada inválida é rejeitada sem escrever', async () => {
  const input = operation(); input.expense!.amountCents = -10;
  const result = await app.inject({ method: 'POST', url: '/api/sync', headers: { origin, cookie }, payload: input });
  assert.equal(result.statusCode, 400); assert.equal(db.prepare('SELECT * FROM expenses WHERE id=?').get(input.entityId), undefined);
});
test('sessões expiradas não permitem sincronizar', async () => {
  const { hashToken } = await import('../server/app.js');
  db.prepare('INSERT INTO sessions VALUES (?,?)').run(hashToken('expired'), Date.now() - 1);
  assert.equal((await app.inject({ url: '/api/trip', headers: { cookie: 'travel_session=expired' } })).statusCode, 401);
});
test('backup consistente restaura dados e o banco sobrevive à reabertura', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'travel-db-test-'));
  try {
    const fileDb = openDatabase(join(directory, 'travel.db')); applyOperation(fileDb, operation());
    const expected = snapshot(fileDb); const copy = await backupDatabase(fileDb, join(directory, 'backups')); fileDb.close();
    const restored = openDatabase(copy); assert.deepEqual(snapshot(restored), expected); assert.equal(restored.prepare('PRAGMA integrity_check').get()!.integrity_check, 'ok'); restored.close();
    const reopened = openDatabase(join(directory, 'travel.db')); assert.deepEqual(snapshot(reopened), expected); reopened.close();
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('tentativas de login são limitadas', async () => {
  let last = 0;
  for (let n = 0; n < 12; n++) last = (await app.inject({ method: 'POST', url: '/api/login', headers: { origin }, payload: { email: 'test@example.test', password: 'wrong' } })).statusCode;
  assert.equal(last, 429);
});
test('comando de restauração recupera backup e revoga sessões', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'travel-restore-test-'));
  try {
    const original = openDatabase(join(directory, 'travel.db'));
    const item = operation(); applyOperation(original, item);
    original.prepare('INSERT INTO sessions VALUES (?,?)').run('test-hash', Date.now() + 100000);
    const saved = await backupDatabase(original, join(directory, 'backups'));
    applyOperation(original, operation({ entityId: item.entityId, expectedVersion: 1, expense: { ...item.expense!, amountCents: 99 } }));
    original.close();
    const command = spawnSync(process.execPath, ['--import', 'tsx', 'server/restore.ts', saved, '--server-stopped'], { env: { ...process.env, DATA_DIR: directory }, encoding: 'utf8' });
    assert.equal(command.status, 0, command.stderr);
    const restored = openDatabase(join(directory, 'travel.db'));
    assert.equal(snapshot(restored).expenses[0].amountCents, 15000);
    assert.equal(restored.prepare('SELECT count(*) AS n FROM sessions').get()!.n, 0);
    restored.close();
  } finally { await rm(directory, { recursive: true, force: true }); }
});
test('orçamento do ticket é salvo com versão, sem alterar o orçamento principal', async () => {
  const before = (await app.inject({ url: '/api/trip', headers: { cookie } })).json().trip;
  assert.equal(before.ticketBudgetCents, null);
  const saved = await app.inject({ method: 'PUT', url: '/api/budget', headers: { origin, cookie }, payload: { ticketBudgetCents: 80000, expectedVersion: before.version } });
  assert.equal(saved.statusCode, 200); assert.equal(saved.json().trip.ticketBudgetCents, 80000); assert.equal(saved.json().trip.budgetCents, before.budgetCents); assert.equal(saved.json().trip.version, before.version + 1);
  assert.equal((await app.inject({ method: 'PUT', url: '/api/budget', headers: { origin, cookie }, payload: { ticketBudgetCents: 1, expectedVersion: before.version } })).statusCode, 409);
  assert.equal((await app.inject({ method: 'PUT', url: '/api/budget', headers: { origin, cookie }, payload: { expectedVersion: before.version + 1 } })).statusCode, 400);
  const both = await app.inject({ method: 'PUT', url: '/api/budget', headers: { origin, cookie }, payload: { budgetCents: 600000, ticketBudgetCents: 90000, expectedVersion: before.version + 1 } });
  assert.equal(both.json().trip.budgetCents, 600000); assert.equal(both.json().trip.ticketBudgetCents, 90000);
});
test('gasto pago com ticket é gravado, devolvido e rejeitado fora de alimentação', async () => {
  const food = operation({ expense: { description: 'Almoço no ticket', amountCents: 4200, category: 'alimentacao', date: '2026-10-18', note: '', paidWithTicket: true } });
  const ok = await app.inject({ method: 'POST', url: '/api/sync', headers: { origin, cookie }, payload: food });
  assert.equal(ok.json().expense.paidWithTicket, true);
  assert.equal((await app.inject({ url: '/api/trip', headers: { cookie } })).json().expenses.find((e: { id: string }) => e.id === food.entityId).paidWithTicket, true);
  const wrong = operation({ expense: { ...food.expense!, category: 'passeios' } });
  assert.equal((await app.inject({ method: 'POST', url: '/api/sync', headers: { origin, cookie }, payload: wrong })).statusCode, 400);
  assert.equal(db.prepare('SELECT * FROM expenses WHERE id=?').get(wrong.entityId), undefined);
  const legacy = await app.inject({ method: 'POST', url: '/api/sync', headers: { origin, cookie }, payload: operation() });
  assert.equal(legacy.json().expense.paidWithTicket, false);
});
test('banco da versão anterior migra preservando dados e ganha os campos do ticket', () => {
  const old = new DatabaseSync(':memory:');
  old.exec('CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)'); old.exec(migrations[0].sql);
  old.prepare('INSERT INTO schema_migrations VALUES (1, ?)').run(new Date().toISOString());
  old.prepare("INSERT INTO expenses VALUES ('11111111-1111-4111-8111-111111111111','Jantar',5000,'alimentacao','2026-10-17','',1,0,'2026-10-17T00:00:00.000Z')").run();
  old.prepare('UPDATE trip SET budget_cents=500000 WHERE id=1').run();
  const migrated = migrateDatabase(old);
  const data = snapshot(migrated);
  assert.equal(data.trip.budgetCents, 500000); assert.equal(data.trip.ticketBudgetCents, null);
  assert.equal(data.expenses.length, 1); assert.equal(data.expenses[0].amountCents, 5000); assert.equal(data.expenses[0].paidWithTicket, false);
  assert.throws(() => migrated.prepare("INSERT INTO expenses VALUES ('22222222-2222-4222-8222-222222222222','x',100,'passeios','2026-10-17','',1,0,'2026-10-17T00:00:00.000Z',1)").run());
  migrated.close();
});
