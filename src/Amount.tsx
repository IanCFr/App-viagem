import { hiddenMoney, money } from '../shared/model';

// Valor em reais que respeita o modo "ocultar valores"; o leitor de tela anuncia "Valor oculto" em vez dos pontinhos.
export function Amount({ cents, hidden }: { cents: number; hidden: boolean }) {
  return hidden ? <span role="img" aria-label="Valor oculto">{hiddenMoney}</span> : <>{money(cents)}</>;
}
