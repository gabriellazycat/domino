import { Rng } from './rng';
import { SealId, SEAL_ORDER } from './cards';
import { BuffId, BUFF_ORDER, Buffs, buffMaxed } from './buffs';

// Eventos entre as fases (loja, prensa de selos, altar místico). Regras:
// - nunca dois eventos seguidos (sempre fase → evento → fase);
// - 40% de chance depois de cada fase, +20% a cada fase que passa sem evento ("sorte com memória");
// - o mesmo tipo de evento nunca aparece duas vezes em sequência;
// - depois da primeira fase (tutorial) não tem evento.
export type EventKind = 'shop' | 'press' | 'mystic';

export interface EventState {
  /** fases vencidas/encerradas desde o último evento */
  since: number;
  last: EventKind | null;
}

export const EVENT_BASE = 0.4;
export const EVENT_STEP = 0.2;

export function eventChance(since: number): number {
  return Math.min(1, EVENT_BASE + EVENT_STEP * Math.max(0, since));
}

/**
 * Decide se vem um evento depois da fase `depthDone` (0 = primeira) e qual. Atualiza `st`.
 * `canMystic`: ainda existe bênção para comprar.
 */
export function rollEvent(st: EventState, depthDone: number, rng: Rng, canMystic: boolean): EventKind | null {
  if (depthDone < 1) return null;
  const roll = rng.float();
  if (roll >= eventChance(st.since)) { st.since++; return null; }
  const kinds: EventKind[] = (['shop', 'press', 'mystic'] as EventKind[]).filter((k) => k !== st.last && (k !== 'mystic' || canMystic));
  const kind = kinds.length ? rng.pick(kinds) : 'shop';
  st.since = 0;
  st.last = kind;
  return kind;
}

/** 3 carimbos diferentes para a prensa. */
export function sealOffers(rng: Rng): SealId[] {
  const pool = [...SEAL_ORDER];
  const out: SealId[] = [];
  while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(rng.float() * pool.length), 1)[0]);
  return out;
}

/** Até 3 bênçãos que ainda dá para pegar. */
export function buffOffers(rng: Rng, buffs: Buffs): BuffId[] {
  const pool = BUFF_ORDER.filter((b) => !buffMaxed(buffs, b));
  const out: BuffId[] = [];
  while (out.length < 3 && pool.length) out.push(pool.splice(Math.floor(rng.float() * pool.length), 1)[0]);
  return out;
}
