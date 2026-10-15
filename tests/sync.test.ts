import 'fake-indexeddb/auto';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TravelStore, enqueue, readState, resolveConflict, synchronize, type Transport } from '../src/store.js';
import { openDatabase, applyOperation, snapshot } from '../server/db.js';
import { type ExpenseInput, type Operation } from '../shared/model.js';
const input: ExpenseInput = { description: 'Tapioca', amountCents: 2500, category: 'alimentacao', date: '2026-10-18', note: '' };
async function fixture(run: (a: TravelStore, b: TravelStore, transport: Transport) => Promise<void>) {
  const server = openDatabase(':memory:'); const a = new TravelStore(crypto.randomUUID()); const b = new TravelStore(crypto.randomUUID());
  const transport: Transport = { send: async (op: Operation) => applyOperation(server, op), snapshot: async () => snapshot(server) };
  try { await run(a, b, transport); } finally { await a.delete(); await b.delete(); server.close(); }
}
test('dois aparelhos offline convergem sem perder inclusões', async () => fixture(async (a, b, transport) => {
  await enqueue(a, crypto.randomUUID(), input); await enqueue(b, crypto.randomUUID(), { ...input, description: 'Uber', category: 'translado' });
  assert.equal((await readState(a)).pending.length, 1);
  await synchronize(a, transport); await synchronize(b, transport); await synchronize(a, transport);
  assert.equal((await readState(a)).expenses.length, 2); assert.deepEqual((await readState(a)).expenses, (await readState(b)).expenses);
}));
test('incluir, editar e excluir offline preserva ordem e não ressuscita gastos', async () => fixture(async (a, _b, transport) => {
  const id = crypto.randomUUID(); await enqueue(a, id, input); await enqueue(a, id, { ...input, amountCents: 3000 }); await enqueue(a, id, null);
  assert.equal((await readState(a)).expenses[0].deleted, true);
  await synchronize(a, transport); const state = await readState(a); assert.equal(state.pending.length, 0); assert.equal(state.expenses[0].deleted, true); assert.equal(state.expenses[0].version, 3);
}));
test('resposta perdida pode ser repetida com segurança', async () => fixture(async (a, _b, transport) => {
  await enqueue(a, crypto.randomUUID(), input);
  await assert.rejects(synchronize(a, { ...transport, send: async op => { await transport.send(op); throw new Error('network'); } }));
  assert.equal((await readState(a)).pending.length, 1);
  await synchronize(a, transport); assert.equal((await readState(a)).pending.length, 0); assert.equal((await readState(a)).expenses.length, 1); assert.equal((await readState(a)).expenses[0].version, 1);
}));
test('fila continua salva depois de fechar e reabrir o armazenamento', async () => fixture(async (a, _b, transport) => {
  const name = a.name; await enqueue(a, crypto.randomUUID(), input); a.close(); const reopened = new TravelStore(name);
  try { assert.equal((await readState(reopened)).pending.length, 1); await synchronize(reopened, transport); assert.equal((await readState(reopened)).expenses[0].description, 'Tapioca'); } finally { reopened.close(); }
}));
test('conflito mantém edições locais até a escolha explícita', async () => fixture(async (a, b, transport) => {
  const id = crypto.randomUUID(); await enqueue(a, id, input); await synchronize(a, transport); await synchronize(b, transport);
  await enqueue(a, id, { ...input, amountCents: 4000 }); await enqueue(b, id, { ...input, amountCents: 5000 }); await enqueue(b, id, { ...input, amountCents: 6000 });
  await synchronize(a, transport); await synchronize(b, transport);
  assert.ok((await readState(b)).pending[0].conflict); assert.equal((await readState(b)).expenses[0].amountCents, 6000);
  await resolveConflict(b, id, 'local'); await synchronize(b, transport); await synchronize(a, transport);
  assert.equal((await readState(a)).expenses[0].amountCents, 6000); assert.equal((await readState(b)).pending.length, 0);
}));
test('exclusão remota conflita com edição e pode ser aceita', async () => fixture(async (a, b, transport) => {
  const id = crypto.randomUUID(); await enqueue(a, id, input); await synchronize(a, transport); await synchronize(b, transport);
  await enqueue(a, id, null); await enqueue(b, id, { ...input, description: 'Tapioca e café' });
  await synchronize(a, transport); await synchronize(b, transport); assert.ok((await readState(b)).pending[0].conflict?.current?.deleted);
  await resolveConflict(b, id, 'remote'); await synchronize(b, transport); assert.equal((await readState(b)).expenses[0].deleted, true); assert.equal((await readState(b)).pending.length, 0);
}));
test('um conflito não bloqueia outros gastos', async () => fixture(async (a, b, transport) => {
  const id = crypto.randomUUID(); await enqueue(a, id, input); await synchronize(a, transport); await synchronize(b, transport);
  await enqueue(a, id, { ...input, amountCents: 1 }); await enqueue(b, id, { ...input, amountCents: 2 }); await enqueue(b, crypto.randomUUID(), input);
  await synchronize(a, transport); await synchronize(b, transport); assert.equal((await readState(b)).pending.length, 1); assert.equal((await readState(b)).expenses.length, 2);
}));
test('falha de autenticação preserva fila e dados', async () => fixture(async (a, _b, transport) => {
  await enqueue(a, crypto.randomUUID(), input);
  await assert.rejects(synchronize(a, { ...transport, send: async () => { throw new Error('401'); } }));
  assert.equal((await readState(a)).pending.length, 1); assert.equal((await readState(a)).expenses[0].amountCents, 2500);
}));
