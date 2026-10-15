import { useEffect, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from 'react';
import { AlertTriangle, BusFront, Eye, EyeOff, Check, CheckCheck, CloudOff, Coffee, Download, Ellipsis, House, List, LoaderCircle, LogOut, Plus, RefreshCw, Settings, ShieldCheck, Smartphone, Sparkles, Ticket, Trash2, Utensils, Wallet, X } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { categories, categoryLabels, csv, dailyTotals, expenseInputSchema, money, parseMoney, today, totals, type Category, type Expense, type ExpenseInput } from '../shared/model';
import { useTravel } from './useTravel';
import { TripPace } from './TripPace';
import { LoginArt } from './LoginArt';
import { Amount } from './Amount';
import { useHiddenValues } from './usePrivacy';

const categoryIcons = { passeios: Ticket, translado: BusFront, alimentacao: Coffee, diversos: Ellipsis };
const shortDate = (date: string) => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(`${date}T12:00:00-03:00`));
const failure = (e: unknown) => e instanceof Error ? e.message : 'Não foi possível salvar. Tente novamente.';
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
type Tab = 'overview' | 'expenses' | 'settings';

function Modal({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); const old = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = old; }; }, []);
  return <dialog ref={ref} onCancel={close} aria-label={title} className="sheet"><div className="sheet-grip" aria-hidden="true"/><div className="sheet-header"><h2>{title}</h2><button className="icon-button" onClick={close} aria-label="Fechar"><X size={20}/></button></div>{children}</dialog>;
}

// O céu de fim de tarde: o sol desce conforme o orçamento é usado e se põe quando ele acaba.
function Dusk({ used }: { used: number }) {
  return <div className="dusk" aria-hidden="true" style={{ '--used': Math.min(Math.max(used, 0), 1.2) } as CSSProperties}><span className="dusk-sun"/><span className="dusk-sea"/></div>;
}

function Login({ onLogin, compact = false }: { onLogin: (email: string, password: string) => Promise<void>; compact?: boolean }) {
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const submit = async (event: FormEvent) => { event.preventDefault(); setBusy(true); setError(''); try { await onLogin(email.trim(), password); } catch (e) { setError(failure(e)); } finally { setBusy(false); } };
  const form = <form onSubmit={submit} className="form-stack">
    <label>E-mail da conta<input type="email" autoComplete="username" required value={email} onChange={e => setEmail(e.target.value)} placeholder="O e-mail de vocês"/></label>
    <label>Senha<input type="password" minLength={1} maxLength={256} autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="Sua senha"/></label>
    {error && <p role="alert" className="error-text">{error}</p>}
    <button className="button primary full" disabled={busy}>{busy ? <LoaderCircle className="spin" size={18}/> : 'Entrar na nossa viagem'}</button>
  </form>;
  if (compact) return form;
  return <main className="login-page">
    <div className="login-sky"><LoginArt/><div className="login-brand">Ian & Lara</div></div>
    <section className="login-card">
      <h1>Férias com cheirinho de mar.</h1>
      <p>João Pessoa espera pela gente de 17 a 24 de outubro. Cada real que a gente anota aqui vira uma lembrança lá.</p>
      {form}
      <p className="login-foot"><CloudOff size={16}/>Depois do primeiro acesso, dá para registrar gastos sem internet.</p>
    </section>
  </main>;
}

function ExpenseForm({ expense, save, close }: { expense: Expense | null; save: (input: ExpenseInput, id?: string) => Promise<void>; close: () => void }) {
  const [description, setDescription] = useState(expense?.description || '');
  const [amount, setAmount] = useState(expense ? (expense.amountCents / 100).toFixed(2).replace('.', ',') : '');
  const [category, setCategory] = useState<Category>(expense?.category || 'alimentacao');
  const [paidWithTicket, setPaidWithTicket] = useState(!!expense?.paidWithTicket);
  const [date, setDate] = useState(expense?.date || today()); const [note, setNote] = useState(expense?.note || '');
  const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault(); const cents = parseMoney(amount);
    const parsed = expenseInputSchema.safeParse({ description, amountCents: cents, category, date, note, paidWithTicket: category === 'alimentacao' && paidWithTicket });
    if (!parsed.success) { setError('Informe uma descrição, uma data válida e um valor maior que zero (ex.: 35,90).'); return; }
    setBusy(true); setError(''); try { await save(parsed.data, expense?.id); close(); } catch (e) { setError(failure(e)); } finally { setBusy(false); }
  };
  return <form onSubmit={submit} className="form-stack">
    <label className="amount-label">Quanto foi?<div className="amount-input"><span>R$</span><input aria-label="Valor do gasto" inputMode="decimal" required autoFocus placeholder="0,00" value={amount} onChange={e => setAmount(e.target.value)}/></div></label>
    <label>Descrição<input required maxLength={120} value={description} onChange={e => setDescription(e.target.value)} placeholder="Ex.: almoço na orla"/></label>
    <fieldset><legend>Categoria</legend><div className="category-picker">{categories.map(key => { const Icon = categoryIcons[key]; return <button type="button" className={category === key ? 'selected' : ''} key={key} onClick={() => { setCategory(key); if (key !== 'alimentacao') setPaidWithTicket(false); }} aria-pressed={category === key}><span className={`circle category-${key}`}><Icon size={20}/></span>{categoryLabels[key].replace('/', '/\u200B')}</button>; })}</div></fieldset>
    {category === 'alimentacao' && <label className="check-row"><input type="checkbox" checked={paidWithTicket} onChange={e => setPaidWithTicket(e.target.checked)}/><span>Pago com ticket alimentação</span></label>}
    <label>Data do gasto<input type="date" required value={date} onChange={e => setDate(e.target.value)}/></label>
    {(date < '2026-10-17' || date > '2026-10-24') && <p className="form-hint">Fora dos dias da viagem? Tudo bem: gastos já pagos também entram no orçamento.</p>}
    <label>Observação <span className="optional">opcional</span><textarea maxLength={1000} rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="Algo que vocês queiram lembrar"/></label>
    {error && <p role="alert" className="error-text">{error}</p>}
    <button className="button primary full" disabled={busy}>{busy ? <LoaderCircle size={18} className="spin"/> : <Check size={18}/>} {expense ? 'Salvar alterações' : 'Salvar gasto'}</button>
    <p className="form-hint center">Salvo neste aparelho e sincronizado quando houver conexão.</p>
  </form>;
}

export function App() {
  const travel = useTravel();
  const [tab, setTab] = useState<Tab>('overview');
  const [editing, setEditing] = useState<Expense | null | undefined>();
  const [deleting, setDeleting] = useState<Expense | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [budgetValue, setBudgetValue] = useState(''); const [ticketValue, setTicketValue] = useState(''); const [budgetBusy, setBudgetBusy] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState(''); const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [toast, setToast] = useState(''); const [actionError, setActionError] = useState('');
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW();
  const [hideValues, toggleHideValues] = useHiddenValues();
  const show = (cents: number) => <Amount cents={cents} hidden={hideValues}/>;
  useEffect(() => { setBudgetValue(travel.trip?.budgetCents == null ? '' : (travel.trip.budgetCents / 100).toFixed(2).replace('.', ',')); }, [travel.trip?.budgetCents]);
  useEffect(() => { setTicketValue(travel.trip?.ticketBudgetCents == null ? '' : (travel.trip.ticketBudgetCents / 100).toFixed(2).replace('.', ',')); }, [travel.trip?.ticketBudgetCents]);
  useEffect(() => { if (!toast) return; const timeout = setTimeout(() => setToast(''), 4500); return () => clearTimeout(timeout); }, [toast]);
  useEffect(() => { const listener = (event: Event) => { event.preventDefault(); setInstallPrompt(event); }; window.addEventListener('beforeinstallprompt', listener); return () => window.removeEventListener('beforeinstallprompt', listener); }, []);
  const expenses = travel.expenses.filter(e => !e.deleted).sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt.localeCompare(a.updatedAt));
  const ticketBudget = travel.trip?.ticketBudgetCents ?? null;
  const summary = totals(expenses, travel.trip?.budgetCents ?? null, ticketBudget);
  const startDate = travel.trip?.startDate ?? '2026-10-17', endDate = travel.trip?.endDate ?? '2026-10-24';
  const days = dailyTotals(expenses, startDate, endDate);
  const budget = travel.trip?.budgetCents ?? null;
  const percent = budget && budget > 0 ? summary.spent / budget * 100 : summary.spent > 0 && budget === 0 ? 100 : 0;
  const ticketPercent = ticketBudget && ticketBudget > 0 ? summary.ticketSpent / ticketBudget * 100 : summary.ticketSpent > 0 && ticketBudget === 0 ? 100 : 0;
  const showTicket = ticketBudget !== null || summary.ticketSpent > 0;
  const overBudget = summary.remaining !== null && summary.remaining < 0;
  const overTicket = summary.ticketRemaining !== null && summary.ticketRemaining < 0;
  const allSpent = summary.spent + summary.ticketSpent;
  const pendingIds = new Set(travel.pending.map(op => op.entityId));
  const conflicts = travel.pending.filter(op => op.conflict);
  const filtered = expenses.filter(e => (!categoryFilter || e.category === categoryFilter) && (!from || e.date >= from) && (!to || e.date <= to));
  const saveBudget = async (event: FormEvent, field: 'budgetCents' | 'ticketBudgetCents', raw: string, message: string) => { event.preventDefault(); const value = parseMoney(raw); if (value === null) { setActionError('Informe um valor válido, como 5.000,00.'); return; } setBudgetBusy(true); setActionError(''); try { await travel.budget({ [field]: value }); setToast(message); } catch (e) { setActionError(failure(e)); } finally { setBudgetBusy(false); } };
  const attempt = async (task: () => Promise<unknown>) => { setActionError(''); try { await task(); } catch (e) { setActionError(failure(e)); } };
  const exportCsv = () => { const url = URL.createObjectURL(new Blob([csv(expenses)], { type: 'text/csv;charset=utf-8' })); const link = document.createElement('a'); link.href = url; link.download = 'joao-pessoa-gastos.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
  const changeTab = (next: Tab) => { setTab(next); setActionError(''); window.scrollTo({ top: 0 }); };
  const syncLabel = !travel.online ? 'Sem internet' : travel.syncing ? 'Sincronizando' : travel.needsLogin ? 'Login necessário' : travel.pending.length ? `${travel.pending.length} pendente(s)` : travel.error ? 'Conexão indisponível' : 'Tudo sincronizado';
  const expenseList = (rows: Expense[]) => rows.length ? <div className="group">{rows.map(expense => { const Icon = categoryIcons[expense.category]; return <div className="expense-row" key={expense.id}>
    <span className={`circle category-${expense.category}`}><Icon size={19}/></span>
    <button className="expense-info" onClick={() => setEditing(expense)} aria-label={`Editar ${expense.description}`}><strong>{expense.description}</strong><span><span className="expense-meta">{shortDate(expense.date)}, {categoryLabels[expense.category]}</span>{expense.paidWithTicket && <span className="ticket-badge">Ticket</span>}{pendingIds.has(expense.id) && <span className="pending-badge" title="Pendente de sincronização">pendente</span>}</span>{expense.note && <small>{expense.note}</small>}</button>
    <strong className="expense-value">{show(expense.amountCents)}</strong>
    <button className="icon-button delete-button" aria-label={`Excluir ${expense.description}`} onClick={() => setDeleting(expense)}><Trash2 size={16}/></button>
  </div>; })}</div> : <div className="empty-state"><span className="circle category-passeios"><List size={22}/></span><h3>{expenses.length ? 'Nenhum gasto por aqui.' : 'Nenhum gasto registrado ainda.'}</h3><p>{expenses.length ? 'Experimente outra categoria ou período.' : 'Registrem o primeiro gasto e acompanhem tudo juntos.'}</p>{!expenses.length && <button className="button secondary" onClick={() => setEditing(null)}><Plus size={17}/> Adicionar primeiro gasto</button>}</div>;

  if (!travel.ready) return <div className="loading"><LoaderCircle className="spin"/><p>Preparando nossa viagem…</p></div>;
  if (!travel.email) return <><Login onLogin={travel.login}/>{travel.error && <p className="login-error" role="alert">{travel.error}</p>}</>;

  const navItems = [{ id: 'overview', label: 'Visão geral', icon: House }, { id: 'expenses', label: 'Gastos', icon: List }, { id: 'settings', label: 'Configurações', icon: Settings }] as const;
  return <div className="app-shell">
    <aside className="sidebar">
      <div className="sidebar-brand">Ian & Lara</div>
      <p className="sidebar-trip"><strong>João Pessoa</strong>17 a 24 de outubro</p>
      <nav aria-label="Navegação principal">{navItems.map(item => <button key={item.id} onClick={() => changeTab(item.id)} className={`nav-item ${tab === item.id ? 'active' : ''}`} aria-current={tab === item.id ? 'page' : undefined}><item.icon size={19}/><span>{item.label}</span></button>)}</nav>
      <p className="sidebar-foot"><ShieldCheck size={15}/>Espaço privado de vocês</p>
    </aside>
    <div className="main-column">
      <header className="topbar">
        <button className={`sync-status ${!travel.online ? 'offline' : ''}`} onClick={() => void travel.sync()} disabled={travel.syncing} aria-label="Sincronizar agora">{travel.syncing ? <RefreshCw size={14} className="spin"/> : !travel.online ? <CloudOff size={14}/> : travel.pending.length ? <RefreshCw size={14}/> : <span className="status-dot"/>}<span>{syncLabel}</span></button>
        <div className="topbar-actions"><button className="icon-button privacy-toggle" aria-label={hideValues ? 'Mostrar valores' : 'Ocultar valores'} onClick={toggleHideValues}>{hideValues ? <EyeOff size={21}/> : <Eye size={21}/>}</button><button className={`icon-button settings-shortcut ${tab === 'settings' ? 'active' : ''}`} aria-label="Configurações" onClick={() => changeTab('settings')}><Settings size={21}/></button></div>
      </header>
      <main className="main-content">
        <div className="page-heading">
          <div><h1>{tab === 'overview' ? 'João Pessoa.' : tab === 'expenses' ? 'Nossos gastos.' : 'Do nosso jeito.'}</h1><p>{tab === 'overview' ? '17 a 24 de outubro, a dois.' : tab === 'expenses' ? 'Tudo o que já foi pago na viagem.' : 'Orçamento, sincronização e conta.'}</p></div>
          <button className="button primary add-expense" onClick={() => setEditing(null)}><Plus size={18}/><span>Adicionar gasto</span></button>
        </div>
        {!travel.online && <div className="notice"><CloudOff size={18}/><span>Vocês estão offline. Os gastos ficam salvos neste aparelho. Abram o app com internet para sincronizar.</span></div>}
        {travel.error && <div className="notice warning" role="status"><AlertTriangle size={18}/><span>{travel.error}</span></div>}
        {travel.needsLogin && <div className="notice warning"><ShieldCheck size={18}/><span>Entrem novamente para sincronizar. Os gastos pendentes estão preservados.</span><button className="text-button" onClick={() => setLoginOpen(true)}>Entrar novamente</button></div>}
        {actionError && <div className="notice danger" role="alert"><AlertTriangle size={18}/><span>{actionError}</span><button className="icon-button" aria-label="Dispensar aviso" onClick={() => setActionError('')}><X size={18}/></button></div>}
        {conflicts.map(op => { const local = travel.expenses.find(e => e.id === op.entityId); const remote = op.conflict!.current; return <section className="conflict-card" key={op.operationId}><h3>Este gasto mudou nos dois aparelhos.</h3><p>Escolham qual versão deve ficar. Nenhuma alteração será descartada sem essa escolha.</p><div className="conflict-versions"><div><strong>Neste aparelho</strong><p>{local?.deleted ? 'Gasto excluído' : <>{local?.description}, {show(local?.amountCents || 0)}</>}</p>{local && !local.deleted && <small>{categoryLabels[local.category]}, {shortDate(local.date)}<br/>{local.note}</small>}<button className="button secondary" onClick={() => void attempt(() => travel.resolve(op.entityId, 'local'))}>Manter esta versão</button></div><div><strong>No outro aparelho</strong><p>{!remote || remote.deleted ? 'Gasto excluído' : <>{remote.description}, {show(remote.amountCents)}</>}</p>{remote && !remote.deleted && <small>{categoryLabels[remote.category]}, {shortDate(remote.date)}<br/>{remote.note}</small>}<button className="button secondary" onClick={() => void attempt(() => travel.resolve(op.entityId, 'remote'))}>Usar versão do outro aparelho</button></div></div></section>; })}
        {needRefresh && <div className="notice"><Sparkles size={18}/><span>Uma atualização está pronta.{travel.pending.length > 0 ? ' Sincronizem os gastos antes de atualizar.' : ''}</span><button className="text-button" disabled={travel.pending.length > 0} onClick={() => void updateServiceWorker(true)}>Atualizar app</button></div>}

        {tab === 'overview' && <div className="overview">
          <section className={`hero ${overBudget ? 'over-budget' : ''}`} aria-label="Resumo do orçamento">
            <div className="hero-sky"><Dusk used={budget === null ? 0.35 : percent / 100}/>
            <div className="hero-body">
              <span className="hero-label">Ainda temos</span>
              <strong className="hero-value" data-testid="remaining">{summary.remaining === null ? '—' : show(summary.remaining)}</strong>
              <span className="hero-note">{budget === null ? 'Definam um orçamento para acompanhar.' : overBudget ? 'O orçamento foi ultrapassado.' : `${Math.round(percent)}% do orçamento usado.`}</span>
            </div></div>
            <dl className="hero-stats">
              <div><dt>Já gastamos</dt><dd data-testid="spent">{show(summary.spent)}</dd><dd className="hero-sub">{plural(expenses.length, 'gasto registrado', 'gastos registrados')}</dd></div>
              <div><dt>Orçamento</dt><dd>{budget === null ? '—' : show(budget)}</dd><dd className="hero-sub"><button className="text-button" onClick={() => changeTab('settings')}>{budget === null ? 'Definir orçamento' : 'Ajustar orçamento'}</button></dd></div>
            </dl>
          </section>
          {showTicket && <section className={`ticket-card ${overTicket ? 'over-budget' : ''}`} aria-label="Ticket alimentação">
            <div className="ticket-head"><span className="circle category-alimentacao"><Utensils size={18}/></span><div><h2>Ticket alimentação</h2><span>{ticketBudget === null ? 'Sem orçamento definido' : <>de {show(ticketBudget)}</>}</span></div><button className="text-button" onClick={() => changeTab('settings')}>{ticketBudget === null ? 'Definir ticket' : 'Ajustar ticket'}</button></div>
            <dl className="ticket-values"><div><dt>Já usamos</dt><dd data-testid="ticket-spent">{show(summary.ticketSpent)}</dd></div><div><dt>Ainda temos</dt><dd data-testid="ticket-remaining">{summary.ticketRemaining === null ? '—' : show(summary.ticketRemaining)}</dd></div></dl>
            {ticketBudget !== null && <div className="bar"><span style={{ width: `${Math.min(100, ticketPercent)}%` }}/></div>}
          </section>}
          <section className="block"><div className="section-heading"><h2>Para onde foi o dinheiro</h2></div>
            <div className="group">{categories.map(key => { const Icon = categoryIcons[key]; const value = summary.byCategory[key]; const count = expenses.filter(e => e.category === key).length; return <button className="category-row" key={key} onClick={() => { setCategoryFilter(key); changeTab('expenses'); }}>
              <span className={`circle category-${key}`}><Icon size={19}/></span>
              <span className="category-main"><strong>{categoryLabels[key]}</strong><span>{plural(count, 'gasto', 'gastos')}{key === 'alimentacao' && summary.ticketSpent > 0 && <>, {show(summary.ticketSpent)} no ticket</>}</span><span className={`bar category-${key}`}><span style={{ width: `${allSpent ? value / allSpent * 100 : 0}%` }}/></span></span>
              <strong className="category-value">{show(value)}</strong>
            </button>; })}</div>
          </section>
          <section className="block"><div className="section-heading"><h2>Últimos registros</h2><button className="text-button" onClick={() => { setCategoryFilter(''); changeTab('expenses'); }}>Ver todos</button></div>{expenseList(expenses.slice(0, 5))}</section>
          <TripPace hidden={hideValues} days={days} budget={budget} startDate={startDate} endDate={endDate}/>
        </div>}

        {tab === 'expenses' && <section className="block">
          <div className="filters"><label>Categoria<select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)}><option value="">Todas as categorias</option>{categories.map(key => <option key={key} value={key}>{categoryLabels[key]}</option>)}</select></label><label>De<input type="date" value={from} onChange={e => setFrom(e.target.value)}/></label><label>Até<input type="date" value={to} min={from || undefined} onChange={e => setTo(e.target.value)}/></label>{(categoryFilter || from || to) && <button className="text-button clear-filter" onClick={() => { setCategoryFilter(''); setFrom(''); setTo(''); }}>Limpar filtros</button>}</div>
          {from && to && from > to && <p className="error-text">A data inicial deve ser anterior à data final.</p>}
          <div className="section-heading"><h2>{plural(filtered.length, 'gasto', 'gastos')}</h2><span className="subtotal">Subtotal <strong>{show(filtered.reduce((sum, e) => sum + e.amountCents, 0))}</strong></span></div>
          {expenseList(filtered)}
        </section>}

        {tab === 'settings' && <div className="settings-grid">
          <section className="settings-card"><span className="circle category-passeios"><Wallet size={19}/></span><h2>Nosso orçamento</h2><p>Um valor para toda a viagem. Vocês podem ajustá-lo sempre que precisarem.</p><form className="form-stack" onSubmit={e => void saveBudget(e, 'budgetCents', budgetValue, 'Orçamento atualizado.')}><label>Orçamento total (R$)<input inputMode="decimal" required className={hideValues ? 'masked' : undefined} placeholder="Ex.: 5.000,00" value={budgetValue} onChange={e => setBudgetValue(e.target.value)}/></label><button className="button primary" disabled={!travel.online || budgetBusy || !travel.trip}>{budgetBusy ? <LoaderCircle size={17} className="spin"/> : <Check size={17}/>} Salvar orçamento</button>{!travel.online && <small>Conectem-se à internet para alterar este valor.</small>}</form></section>
          <section className="settings-card"><span className="circle category-alimentacao"><Utensils size={19}/></span><h2>Ticket alimentação</h2><p>Um saldo à parte, usado só nos gastos de alimentação marcados como pagos com ticket.</p><form className="form-stack" onSubmit={e => void saveBudget(e, 'ticketBudgetCents', ticketValue, 'Ticket atualizado.')}><label>Orçamento do ticket alimentação (R$)<input inputMode="decimal" required className={hideValues ? 'masked' : undefined} placeholder="Ex.: 800,00" value={ticketValue} onChange={e => setTicketValue(e.target.value)}/></label><button className="button primary" disabled={!travel.online || budgetBusy || !travel.trip}>{budgetBusy ? <LoaderCircle size={17} className="spin"/> : <Check size={17}/>} Salvar ticket</button>{!travel.online && <small>Conectem-se à internet para alterar este valor.</small>}</form></section>
          <section className="settings-card"><span className="circle category-translado"><RefreshCw size={19}/></span><h2>Juntos, em dia</h2><p>Os dois celulares compartilham os mesmos registros.</p><dl className="sync-details"><div><dt>Alterações pendentes</dt><dd>{travel.pending.length}</dd></div><div><dt>Última sincronização</dt><dd>{travel.lastSync ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(travel.lastSync)) : 'Ainda não realizada'}</dd></div></dl><button className="button secondary" disabled={!travel.online || travel.syncing} onClick={() => void travel.sync()}><RefreshCw size={17} className={travel.syncing ? 'spin' : ''}/> Sincronizar agora</button><p className="small-note">Abram o app com internet para enviar os registros feitos offline. Alterações ainda não sincronizadas existem somente no aparelho em que foram feitas.</p></section>
          <section className="settings-card"><span className="circle category-diversos"><Download size={19}/></span><h2>Levar uma cópia</h2><p>Baixem uma planilha com todos os gastos disponíveis neste aparelho, incluindo os pendentes.</p><button className="button secondary" onClick={exportCsv}><Download size={17}/> Exportar CSV</button><p className="small-note">O arquivo abre no Excel e no Google Planilhas.</p></section>
          <section className="settings-card"><span className="circle category-translado"><Smartphone size={19}/></span><h2>Sempre à mão</h2><p>No Safari, toquem em Compartilhar e depois em “Adicionar à Tela de Início” para abrir como um aplicativo.</p>{installPrompt && <button className="button secondary" onClick={() => { void installPrompt.prompt(); setInstallPrompt(null); }}><Plus size={17}/> Instalar aplicativo</button>}</section>
          <section className="settings-card account-card"><div><h2>Nosso espaço</h2><p>{travel.email}</p><small>A conta é compartilhada por Ian e Lara.</small></div><button className="button secondary" disabled={!travel.online || travel.syncing || travel.pending.length > 0} onClick={() => void attempt(travel.logout)}><LogOut size={17}/> Sair deste aparelho</button>{travel.pending.length > 0 && <small>Sincronizem e resolvam os registros pendentes antes de sair.</small>}</section>
        </div>}
      </main>
    </div>
    <nav className="tabbar" aria-label="Navegação">
      <button className={`tab ${tab === 'overview' ? 'active' : ''}`} aria-current={tab === 'overview' ? 'page' : undefined} onClick={() => changeTab('overview')}><House size={22}/><span>Visão geral</span></button>
      <button className="tab-add" aria-label="Adicionar gasto" onClick={() => setEditing(null)}><Plus size={26} strokeWidth={2.4}/></button>
      <button className={`tab ${tab === 'expenses' ? 'active' : ''}`} aria-current={tab === 'expenses' ? 'page' : undefined} onClick={() => changeTab('expenses')}><List size={22}/><span>Gastos</span></button>
    </nav>
    {toast && <div role="status" className="toast"><CheckCheck size={18}/>{toast}</div>}
    {editing !== undefined && <Modal title={editing ? 'Editar gasto' : 'Novo gasto'} close={() => setEditing(undefined)}><ExpenseForm expense={editing} save={async (input, id) => { await travel.save(input, id); setToast('Gasto salvo neste aparelho.'); }} close={() => setEditing(undefined)}/></Modal>}
    {deleting && <Modal title="Excluir este gasto?" close={() => setDeleting(null)}><div className="form-stack"><p>“{deleting.description}”, de <strong>{show(deleting.amountCents)}</strong>, será removido do orçamento nos dois aparelhos após sincronizar.</p><button className="button danger-button" onClick={() => void attempt(async () => { await travel.save(null, deleting.id); setDeleting(null); setToast('Gasto excluído.'); })}><Trash2 size={18}/> Confirmar exclusão</button><button className="button secondary" onClick={() => setDeleting(null)}>Manter gasto</button></div></Modal>}
    {loginOpen && <Modal title="Entrar novamente" close={() => setLoginOpen(false)}><Login compact onLogin={async (email, password) => { await travel.login(email, password); setLoginOpen(false); }}/></Modal>}
  </div>;
}
