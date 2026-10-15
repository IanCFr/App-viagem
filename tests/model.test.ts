import { test } from 'node:test';
import assert from 'node:assert/strict';
import { csv, dailyTotals, expenseInputSchema, money, paceSeries, parseMoney, shownMoney, totals, type Expense } from '../shared/model.js';
const expense = (amountCents: number, category: Expense['category'] = 'alimentacao'): Expense => ({ id: crypto.randomUUID(), description: 'Almoço', category, amountCents, date: '2026-10-17', note: '', version: 1, deleted: false, updatedAt: new Date().toISOString() });
test('calcula total, restante e categorias em centavos', () => {
  assert.deepEqual(totals([expense(15000), expense(8000, 'translado')], 500000), { spent: 23000, remaining: 477000, ticketSpent: 0, ticketRemaining: null, byCategory: { passeios: 0, translado: 8000, alimentacao: 15000, diversos: 0 } });
  assert.equal(totals([expense(10), expense(20)], 100).remaining, 70);
});
test('orçamento não definido, zero, excedido e despesas excluídas', () => {
  assert.equal(totals([], null).remaining, null);
  assert.equal(totals([], 0).remaining, 0);
  assert.equal(totals([expense(250)], 0).remaining, -250);
  assert.equal(totals([{ ...expense(999), deleted: true }], 100).spent, 0);
});
test('interpreta moeda brasileira e rejeita formatos ambíguos', () => {
  for (const [input, expected] of [['5.000,00', 500000], ['0,10', 10], ['35,9', 3590], ['100', 10000], ['0', 0], ['R$ 12,34', 1234]] as const) assert.equal(parseMoney(input), expected);
  for (const input of ['', '-1', '1.25', '1,234', '1e3', 'Infinity', 'a', '1,2,3', '9999999999999999']) assert.equal(parseMoney(input), null);
});
test('valida valor e data sem impedir despesas anteriores à viagem', () => {
  const valid = { description: 'Reserva paga', category: 'passeios', amountCents: 1500, date: '2026-10-01', note: '' };
  assert.equal(expenseInputSchema.safeParse(valid).success, true);
  for (const patch of [{ description: '' }, { amountCents: 0 }, { amountCents: -10 }, { amountCents: 1.1 }, { category: 'errada' }, { date: '2026-02-30' }]) assert.equal(expenseInputSchema.safeParse({ ...valid, ...patch }).success, false);
});
test('CSV preserva vírgulas, aspas, quebras e neutraliza fórmulas', () => {
  const result = csv([{ ...expense(3590), description: '=SUM(A1)', note: 'Foi "ótimo"\nSim' }]);
  assert.match(result, /"'=SUM\(A1\)"/); assert.match(result, /"35,90"/); assert.match(result, /Foi ""ótimo""\nSim/);
});
test('gastos pagos com ticket abatem só do saldo do ticket, mas contam na categoria', () => {
  const ticket = { ...expense(4000), paidWithTicket: true };
  const result = totals([expense(15000), ticket, expense(8000, 'translado')], 500000, 30000);
  assert.equal(result.spent, 23000); assert.equal(result.remaining, 477000);
  assert.equal(result.ticketSpent, 4000); assert.equal(result.ticketRemaining, 26000);
  assert.equal(result.byCategory.alimentacao, 19000);
  assert.equal(totals([ticket], null, null).ticketRemaining, null);
  assert.equal(totals([{ ...ticket, amountCents: 5000 }], null, 3000).ticketRemaining, -2000);
  assert.equal(totals([{ ...ticket, deleted: true }], null, 3000).ticketSpent, 0);
});
test('ticket só vale para alimentação', () => {
  const valid = { description: 'Almoço', category: 'alimentacao', amountCents: 4000, date: '2026-10-18', note: '', paidWithTicket: true };
  assert.equal(expenseInputSchema.safeParse(valid).success, true);
  assert.equal(expenseInputSchema.safeParse({ ...valid, category: 'passeios' }).success, false);
  assert.equal(expenseInputSchema.safeParse({ ...valid, category: 'passeios', paidWithTicket: false }).success, true);
  assert.equal(expenseInputSchema.safeParse({ ...valid, paidWithTicket: undefined, category: 'passeios' }).success, true);
  assert.equal(expenseInputSchema.safeParse({ ...valid, paidWithTicket: 'sim' }).success, false);
});
test('gastos por dia cobrem a viagem inteira, separam o ticket e incluem dias fora do período', () => {
  const on = (date: string, amountCents: number, paidWithTicket = false): Expense => ({ ...expense(amountCents), date, paidWithTicket });
  const days = dailyTotals([on('2026-10-17', 1000), on('2026-10-17', 500, true), on('2026-10-19', 700), { ...on('2026-10-19', 9999), deleted: true }, on('2026-10-10', 300), on('2026-10-26', 200)], '2026-10-17', '2026-10-24');
  assert.deepEqual(days.map(d => d.date), ['2026-10-10', '2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-26']);
  assert.deepEqual(days.find(d => d.date === '2026-10-17'), { date: '2026-10-17', cashCents: 1000, ticketCents: 500 });
  assert.deepEqual(days.find(d => d.date === '2026-10-18'), { date: '2026-10-18', cashCents: 0, ticketCents: 0 });
  assert.equal(days.find(d => d.date === '2026-10-19')!.cashCents, 700);
  assert.equal(dailyTotals([], '2026-10-30', '2026-10-31').length, 2);
});
test('ritmo da viagem acumula só o que conta no orçamento e distribui o orçamento pelos dias', () => {
  const day = (date: string, cashCents: number, ticketCents = 0) => ({ date, cashCents, ticketCents });
  const series = paceSeries([day('2026-10-10', 300), day('2026-10-17', 1000, 500), day('2026-10-18', 0), day('2026-10-19', 700), day('2026-10-26', 200)], 8000, '2026-10-17', '2026-10-24');
  assert.deepEqual(series.map(d => d.cumulativeCents), [300, 1300, 1300, 2000, 2200]);
  assert.deepEqual(series.map(d => d.paceCents), [0, 1000, 2000, 3000, 8000]);
  assert.deepEqual(series[1], { date: '2026-10-17', cashCents: 1000, ticketCents: 500, cumulativeCents: 1300, paceCents: 1000 });
  assert.deepEqual(paceSeries([day('2026-10-17', 100)], null, '2026-10-17', '2026-10-24').map(d => d.paceCents), [null]);
  assert.equal(paceSeries([day('2026-10-17', 0)], 1000, '2026-10-17', '2026-10-19')[0].paceCents, 333);
});
test('valores ocultos usam máscara de tamanho fixo, sem revelar a ordem de grandeza', () => {
  assert.equal(shownMoney(3590, false), money(3590));
  assert.equal(shownMoney(5, true), 'R$ ••••••');
  assert.equal(shownMoney(123456789, true), shownMoney(5, true));
  assert.equal(shownMoney(-2000, true), 'R$ ••••••');
});
test('CSV indica se o gasto foi pago com ticket', () => {
  const lines = csv([{ ...expense(3590), paidWithTicket: true }, expense(1000)]).split('\r\n');
  assert.match(lines[0], /;"Pago com ticket"$/);
  assert.equal(lines.filter(l => l.endsWith('"Sim"')).length, 1); assert.equal(lines.filter(l => l.endsWith('"Não"')).length, 1);
});
