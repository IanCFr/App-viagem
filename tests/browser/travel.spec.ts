import { test, expect, type Page } from '@playwright/test';
const login = async (page: Page) => {
  await page.goto('/'); await page.getByLabel('E-mail da conta').fill('test@example.test'); await page.getByLabel('Senha', { exact: true }).fill('test-password-not-for-production'); await page.getByRole('button', { name: 'Entrar na nossa viagem' }).click(); await expect(page.getByRole('heading', { name: 'João Pessoa.' })).toBeVisible();
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
};
const addExpense = async (page: Page, description: string, value: string) => {
  await page.getByRole('button', { name: 'Adicionar gasto', exact: true }).click(); await page.getByLabel('Valor do gasto').fill(value); await page.getByLabel('Descrição', { exact: true }).fill(description); await page.getByRole('button', { name: 'Salvar gasto', exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(0);
};
// Limpa somente o banco descartável do processo de teste, usando a API autenticada.
const clearExpenses = (page: Page) => page.evaluate(async () => {
  const snapshot = await (await fetch('/api/trip')).json();
  for (const expense of snapshot.expenses) if (!expense.deleted) await fetch('/api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operationId: crypto.randomUUID(), entityId: expense.id, expectedVersion: expense.version, kind: 'delete' }) });
});
test('dois celulares: orçamento, offline, reabertura, filtros e exclusão', async ({ browser, page }, testInfo) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await login(page);
  await clearExpenses(page);
  await page.getByRole('button', { name: 'Configurações', exact: true }).click();
  await page.getByLabel('Orçamento total (R$)').fill('5.000,00'); await page.getByRole('button', { name: 'Salvar orçamento', exact: true }).click(); await expect(page.getByRole('status').filter({ hasText: 'Orçamento atualizado.' })).toBeVisible();
  await page.getByRole('button', { name: 'Visão geral', exact: true }).click();
  await addExpense(page, 'Almoço de teste', '150,00');
  const second = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }); let other = await second.newPage(); await login(other);
  await expect(other.getByText('Almoço de teste', { exact: true })).toBeVisible();
  await second.setOffline(true); await addExpense(other, 'Café offline', '80,00');
  await expect(other.getByTestId('spent')).toHaveText('R$ 230,00');
  await other.close(); other = await second.newPage(); await other.goto('/');
  await expect(other.getByText('Café offline', { exact: true })).toBeVisible(); await expect(other.getByTestId('remaining')).toHaveText('R$ 4.770,00');
  await other.getByRole('button', { name: 'Editar Café offline', exact: true }).click(); await other.getByLabel('Descrição', { exact: true }).fill('Café depois do passeio'); await other.getByRole('button', { name: 'Salvar alterações' }).click();
  await second.setOffline(false); await other.getByRole('button', { name: 'Sincronizar agora', exact: true }).click();
  await expect(page.getByText('Café depois do passeio', { exact: true })).toBeVisible(); await expect(page.getByTestId('remaining')).toHaveText('R$ 4.770,00');
  await page.screenshot({ path: `.local/${testInfo.project.name}-resumo.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1366, height: 900 }); await page.screenshot({ path: `.local/${testInfo.project.name}-desktop.png`, fullPage: true }); await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Gastos', exact: true }).click();
  // Regressão: no Safari do iPhone o campo de data nativo tem largura mínima grande e fazia os filtros transbordarem do cartão.
  const wideDate = await page.addStyleTag({ content: '.filters label:not(:first-child)::after { content: ""; display: block; width: 210px; height: 0; }' });
  expect(await page.evaluate(() => { const card = document.querySelector('.filters')!.getBoundingClientRect(); return [...document.querySelectorAll('.filters select, .filters input')].every(el => el.getBoundingClientRect().right <= card.right); })).toBe(true);
  await wideDate.evaluate(style => (style as HTMLStyleElement).remove());
  await page.getByRole('combobox', { name: 'Categoria', exact: true }).selectOption('translado'); await expect(page.getByText('Nenhum gasto por aqui.')).toBeVisible();
  await page.getByRole('button', { name: 'Limpar filtros' }).click(); await page.getByRole('button', { name: 'Excluir Café depois do passeio', exact: true }).click(); await page.getByRole('button', { name: 'Confirmar exclusão' }).click();
  await expect(other.getByText('Café depois do passeio', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Configurações', exact: true }).click();
  const downloadPromise = page.waitForEvent('download'); await page.getByRole('button', { name: 'Exportar CSV' }).click(); expect((await downloadPromise).suggestedFilename()).toBe('joao-pessoa-gastos.csv');
  await page.screenshot({ path: `.local/${testInfo.project.name}-configuracoes.png`, fullPage: true });
  await second.setOffline(true);
  await other.getByRole('button', { name: 'Editar Almoço de teste', exact: true }).click(); await other.getByLabel('Valor do gasto').fill('170,00'); await other.getByRole('button', { name: 'Salvar alterações' }).click();
  await page.getByRole('button', { name: 'Visão geral', exact: true }).click(); await page.getByRole('button', { name: 'Editar Almoço de teste', exact: true }).click(); await page.getByLabel('Valor do gasto').fill('160,00'); await page.getByRole('button', { name: 'Salvar alterações' }).click();
  await expect(page.getByRole('button', { name: 'Sincronizar agora', exact: true })).toHaveText('Tudo sincronizado');
  // O texto acima já aparece antes da sincronização da edição começar; confirma no servidor antes de reconectar o outro aparelho.
  await expect.poll(async () => ((await (await page.request.get('/api/trip')).json()).expenses as { description: string; amountCents: number; deleted: boolean }[]).find(e => !e.deleted && e.description === 'Almoço de teste')?.amountCents).toBe(16000);
  await second.setOffline(false); await other.getByRole('button', { name: 'Sincronizar agora', exact: true }).click();
  await expect(other.getByRole('heading', { name: 'Este gasto mudou nos dois aparelhos.' })).toBeVisible(); await other.getByRole('button', { name: 'Manter esta versão', exact: true }).click();
  await expect(page.getByTestId('spent')).toHaveText('R$ 170,00');
  expect(errors).toEqual([]); await second.close();
});
test('ticket alimentação tem saldo próprio e o gráfico mostra o ritmo da viagem', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Férias com cheirinho de mar.' })).toBeVisible();
  await expect(page.getByRole('img', { name: /casal de mãos dadas/ })).toBeVisible(); await expect(page.getByText('Ian & Lara')).toBeVisible();
  await page.screenshot({ path: '.local/iphone-login.png' });
  await login(page); await clearExpenses(page);
  await page.getByRole('button', { name: 'Configurações', exact: true }).click();
  await page.getByLabel('Orçamento total (R$)').fill('5.000,00'); await page.getByRole('button', { name: 'Salvar orçamento', exact: true }).click(); await expect(page.getByRole('status').filter({ hasText: 'Orçamento atualizado.' })).toBeVisible();
  await page.getByLabel('Orçamento do ticket alimentação (R$)').fill('800,00'); await page.getByRole('button', { name: 'Salvar ticket', exact: true }).click(); await expect(page.getByRole('status').filter({ hasText: 'Ticket atualizado.' })).toBeVisible();
  await page.getByRole('button', { name: 'Visão geral', exact: true }).click();
  await page.getByRole('button', { name: 'Adicionar gasto', exact: true }).click();
  await page.getByLabel('Valor do gasto').fill('42,00'); await page.getByLabel('Descrição', { exact: true }).fill('Almoço no ticket');
  await page.getByLabel('Pago com ticket alimentação').check();
  await page.getByRole('dialog').getByRole('button', { name: 'Eventos/Passeios' }).click(); await expect(page.getByLabel('Pago com ticket alimentação')).toHaveCount(0);
  await page.getByRole('dialog').getByRole('button', { name: 'Alimentação' }).click(); await expect(page.getByLabel('Pago com ticket alimentação')).not.toBeChecked(); await page.getByLabel('Pago com ticket alimentação').check();
  await page.getByLabel('Data do gasto').fill('2026-10-14'); await page.getByRole('button', { name: 'Salvar gasto', exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Adicionar gasto', exact: true }).click();
  await page.getByLabel('Valor do gasto').fill('100,00'); await page.getByLabel('Descrição', { exact: true }).fill('Passeio de barco'); await page.getByRole('dialog').getByRole('button', { name: 'Eventos/Passeios' }).click();
  await page.getByLabel('Data do gasto').fill('2026-10-14'); await page.getByRole('button', { name: 'Salvar gasto', exact: true }).click(); await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByTestId('spent')).toHaveText('R$ 100,00'); await expect(page.getByTestId('remaining')).toHaveText('R$ 4.900,00');
  await expect(page.getByTestId('ticket-spent')).toHaveText('R$ 42,00'); await expect(page.getByTestId('ticket-remaining')).toHaveText('R$ 758,00');
  const chart = page.getByRole('region', { name: 'Ritmo da viagem' }); await expect(chart).toBeVisible();
  const detail = chart.getByTestId('day-detail');
  await expect(detail).toContainText('R$ 142,00'); await expect(detail.getByText('No ticket')).toBeVisible(); await expect(detail).toContainText('R$ 42,00');
  await expect(chart.getByRole('button', { name: /17 de out/ })).toBeVisible(); await chart.getByRole('button', { name: /17 de out/ }).click();
  // 17/10 é o primeiro dia: nada gasto no dia, R$ 100,00 acumulados de antes e ritmo ideal de 5.000,00 ÷ 8 dias.
  await expect(detail).toContainText('R$ 0,00'); await expect(detail).toContainText('R$ 100,00'); await expect(detail).toContainText('R$ 625,00');
  await page.screenshot({ path: '.local/iphone-ticket-grafico.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'Gastos', exact: true }).click(); await expect(page.getByText('Ticket', { exact: true })).toHaveCount(1);
  // Ocultar valores: esconde todos os reais, mantém descrições e é lembrado depois de reabrir o app.
  await page.getByRole('button', { name: 'Ocultar valores' }).click();
  await expect(page.getByRole('button', { name: 'Mostrar valores' })).toBeVisible();
  await expect(page.getByText('Passeio de barco')).toBeVisible(); await expect(page.locator('main')).not.toContainText(/R\$\s?\d/);
  await page.reload(); await expect(page.getByRole('button', { name: 'Mostrar valores' })).toBeVisible();
  await expect(page.getByTestId('remaining')).toHaveText('R$ ••••••'); await expect(page.getByTestId('spent')).toHaveText('R$ ••••••');
  await expect(page.getByTestId('remaining').getByRole('img', { name: 'Valor oculto' })).toBeVisible();
  await expect(page.locator('main')).not.toContainText(/R\$\s?\d/);
  await page.getByRole('button', { name: 'Mostrar valores' }).click(); await expect(page.getByTestId('remaining')).toHaveText('R$ 4.900,00');
  expect(errors).toEqual([]);
});
