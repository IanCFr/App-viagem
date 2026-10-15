import { z } from 'zod';

export const categories = ['passeios', 'translado', 'alimentacao', 'diversos'] as const;
export type Category = typeof categories[number];
export const categoryLabels: Record<Category, string> = {
  passeios: 'Eventos/Passeios', translado: 'Translado', alimentacao: 'Alimentação', diversos: 'Diversos'
};
export const centsSchema = z.number().int().min(0).max(9999999999);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => {
  const d = new Date(`${v}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}, 'Data inválida');
export const expenseInputSchema = z.object({
  description: z.string().trim().min(1).max(120), amountCents: centsSchema.refine(n => n > 0),
  category: z.enum(categories), date: dateSchema, note: z.string().trim().max(1000).default(''), paidWithTicket: z.boolean().optional()
}).strict().refine(e => !e.paidWithTicket || e.category === 'alimentacao', { message: 'Ticket só vale para alimentação.', path: ['paidWithTicket'] });
export type ExpenseInput = z.infer<typeof expenseInputSchema>;
export type Expense = ExpenseInput & { id: string; version: number; deleted: boolean; updatedAt: string };
export type Trip = { name: string; startDate: string; endDate: string; budgetCents: number | null; ticketBudgetCents: number | null; version: number };
export const operationSchema = z.object({
  operationId: z.string().uuid(), entityId: z.string().uuid(), expectedVersion: z.number().int().min(0),
  kind: z.enum(['upsert', 'delete']), expense: expenseInputSchema.optional()
}).strict().refine(op => op.kind !== 'upsert' || !!op.expense);
export type Operation = z.infer<typeof operationSchema>;
export type SyncResult = { status: 'ok'; expense: Expense } | { status: 'conflict'; current: Expense | null };
export type Snapshot = { trip: Trip; expenses: Expense[] };
export const money = (cents: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
// Máscara de tamanho fixo: não revela se o valor tem poucos ou muitos dígitos.
export const hiddenMoney = 'R$ ••••••';
export const shownMoney = (cents: number, hidden: boolean) => hidden ? hiddenMoney : money(cents);
export function parseMoney(value: string): number | null {
  const raw = value.trim().replace(/^R\$\s*/, '');
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d{1,2})?$/.test(raw)) return null;
  const [integer, fraction = ''] = raw.replaceAll('.', '').split(',');
  const cents = Number(integer) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents <= 9999999999 ? cents : null;
}
export function today() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
export function totals(expenses: Expense[], budget: number | null, ticketBudget: number | null = null) {
  const byCategory: Record<Category, number> = { passeios: 0, translado: 0, alimentacao: 0, diversos: 0 };
  let ticketSpent = 0;
  for (const expense of expenses) if (!expense.deleted) { byCategory[expense.category] += expense.amountCents; if (expense.paidWithTicket) ticketSpent += expense.amountCents; }
  const spent = Object.values(byCategory).reduce((sum, n) => sum + n, 0) - ticketSpent;
  return { spent, remaining: budget === null ? null : budget - spent, ticketSpent, ticketRemaining: ticketBudget === null ? null : ticketBudget - ticketSpent, byCategory };
}
export type DayTotal = { date: string; cashCents: number; ticketCents: number };
const addDays = (date: string, days: number) => new Date(new Date(`${date}T12:00:00Z`).getTime() + days * 86400000).toISOString().slice(0, 10);
export function dailyTotals(expenses: Expense[], startDate: string, endDate: string): DayTotal[] {
  const days = new Map<string, DayTotal>();
  for (let date = startDate; date <= endDate; date = addDays(date, 1)) days.set(date, { date, cashCents: 0, ticketCents: 0 });
  for (const expense of expenses) if (!expense.deleted) {
    const day = days.get(expense.date) ?? { date: expense.date, cashCents: 0, ticketCents: 0 }; days.set(expense.date, day);
    if (expense.paidWithTicket) day.ticketCents += expense.amountCents; else day.cashCents += expense.amountCents;
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}
export type PacePoint = DayTotal & { cumulativeCents: number; paceCents: number | null };
const dayIndex = (from: string, to: string) => Math.round((new Date(`${to}T12:00:00Z`).getTime() - new Date(`${from}T12:00:00Z`).getTime()) / 86400000);
// Acumula só o que conta no orçamento (sem ticket) e distribui o orçamento igualmente pelos dias da viagem.
export function paceSeries(days: DayTotal[], budget: number | null, startDate: string, endDate: string): PacePoint[] {
  const tripDays = dayIndex(startDate, endDate) + 1;
  let cumulativeCents = 0;
  return days.map(day => {
    cumulativeCents += day.cashCents;
    const elapsed = Math.min(Math.max(dayIndex(startDate, day.date) + 1, 0), tripDays);
    return { ...day, cumulativeCents, paceCents: budget === null ? null : Math.round(budget * elapsed / tripDays) };
  });
}
export function csv(expenses: Expense[]) {
  const cell = (v: string) => '"' + (/^(?:\s*[=+\-@]|[\t\r\n])/.test(v) ? "'" + v : v).replaceAll('"', '""') + '"';
  return '\uFEFF' + [['Data', 'Descrição', 'Categoria', 'Valor (R$)', 'Observação', 'Pago com ticket'], ...expenses.filter(e => !e.deleted).sort((a, b) => b.date.localeCompare(a.date)).map(e => [e.date, e.description, categoryLabels[e.category], (e.amountCents / 100).toFixed(2).replace('.', ','), e.note, e.paidWithTicket ? 'Sim' : 'Não'])].map(row => row.map(cell).join(';')).join('\r\n');
}
