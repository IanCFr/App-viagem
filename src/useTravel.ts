import { useEffect, useRef, useState } from 'react';
import { liveQuery } from 'dexie';
import { api, ApiError } from './api';
import { TravelStore, enqueue, readState, resolveConflict, synchronize, type LocalState } from './store';
import type { ExpenseInput, Snapshot, SyncResult, Trip } from '../shared/model';

export const db = new TravelStore();
const blank: LocalState = { trip: null, expenses: [], pending: [], email: null, lastSync: null };
export function useTravel() {
  const [data, setData] = useState(blank);
  const [ready, setReady] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  const [syncing, setSyncing] = useState(false);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [error, setError] = useState('');
  const active = useRef(false);
  const identity = useRef(false);
  const synchronizeNow = async () => {
    if (active.current || !navigator.onLine || !identity.current) return;
    active.current = true; setSyncing(true);
    const run = async () => synchronize(db, { send: op => api<SyncResult>('sync', 'POST', op), snapshot: () => api<Snapshot>('trip') });
    try {
      if (navigator.locks) await navigator.locks.request('travel-sync', run); else await run();
      setNeedsLogin(false); setError('');
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) { setNeedsLogin(true); identity.current = false; }
      else setError(e instanceof ApiError ? e.message : 'Sem conexão com o servidor. Seus registros continuam salvos neste aparelho.');
    } finally { setSyncing(false); active.current = false; }
  };
  useEffect(() => {
    const subscription = liveQuery(() => readState(db)).subscribe({ next: state => { setData(state); setReady(true); }, error: () => { setError('Não foi possível abrir o armazenamento do aparelho. Verifique o espaço disponível e as permissões do navegador.'); setReady(true); } });
    void db.meta.get('email').then(email => { identity.current = !!email?.value; void synchronizeNow(); });
    const reconnect = () => { setOnline(navigator.onLine); void synchronizeNow(); };
    const visible = () => { if (document.visibilityState === 'visible') void synchronizeNow(); };
    window.addEventListener('online', reconnect); window.addEventListener('offline', reconnect); document.addEventListener('visibilitychange', visible);
    const timer = setInterval(() => { if (document.visibilityState === 'visible') void synchronizeNow(); }, 10000);
    return () => { subscription.unsubscribe(); clearInterval(timer); window.removeEventListener('online', reconnect); window.removeEventListener('offline', reconnect); document.removeEventListener('visibilitychange', visible); };
  }, []);
  const login = async (email: string, password: string) => {
    const account = await api<{ email: string }>('login', 'POST', { email, password });
    await db.meta.put({ key: 'email', value: account.email });
    identity.current = true; setNeedsLogin(false); await synchronizeNow();
    if (navigator.storage?.persist) void navigator.storage.persist().catch(() => {});
  };
  const logout = async () => {
    if ((await db.pending.count()) > 0) throw new Error('Sincronize ou resolva os gastos pendentes antes de sair.');
    if (active.current) throw new Error('Aguarde a sincronização terminar.');
    await api('logout', 'POST');
    identity.current = false;
    await db.transaction('rw', [db.meta, db.pending, db.records], async () => { await db.meta.clear(); await db.pending.clear(); await db.records.clear(); });
    setNeedsLogin(false);
  };
  const save = async (input: ExpenseInput | null, id: string = crypto.randomUUID()) => { await enqueue(db, id, input); void synchronizeNow(); };
  const budget = async (patch: { budgetCents?: number; ticketBudgetCents?: number }) => {
    if (!navigator.onLine) throw new Error('Conecte-se à internet para alterar o orçamento.');
    try {
      const { trip } = await api<{ trip: Trip }>('budget', 'PUT', { ...patch, expectedVersion: data.trip?.version });
      await db.meta.put({ key: 'trip', value: trip });
    } catch (e) { if (e instanceof ApiError && e.status === 409) await synchronizeNow(); throw e; }
  };
  const resolve = async (id: string, choice: 'local' | 'remote') => { await resolveConflict(db, id, choice); void synchronizeNow(); };
  return { ...data, ready, online, syncing, needsLogin, error, login, logout, save, budget, sync: synchronizeNow, resolve };
}
