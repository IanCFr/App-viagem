import { useState } from 'react';

// Preferência deste aparelho; sem armazenamento disponível (ex.: aba privada) vale só enquanto o app estiver aberto.
const key = 'ocultar-valores';
const read = () => { try { return localStorage.getItem(key) === '1'; } catch { return false; } };
export function useHiddenValues() {
  const [hidden, setHidden] = useState(read);
  const toggle = () => { const next = !hidden; setHidden(next); try { localStorage.setItem(key, next ? '1' : '0'); } catch { /* segue só na memória */ } };
  return [hidden, toggle] as const;
}
