import { Rng } from './rng';
import { SealId, SEAL_ORDER } from './cards';
import { BuffId, BUFF_ORDER, Buffs, buffMaxed } from './buffs';
import { PieceId, CURSED } from './pieces';

// Eventos entre as fases (loja, prensa de selos, altar místico e o PRESENTE DO DONO, o único ruim). Regras:
// - nunca dois eventos seguidos (sempre fase → evento → fase);
// - 40% de chance depois de cada fase, +20% a cada fase que passa sem evento ("sorte com memória");
// - o mesmo tipo de evento nunca aparece duas vezes em sequência;
// - depois da primeira fase (tutorial) não tem evento;
// - o Presente do Dono (peça maldita) só a partir da 3ª fase vencida e com metade do peso dos outros.
export type EventKind = 'shop' | 'press' | 'mystic' | 'curse';

/** Fase vencida a partir da qual o Presente do Dono pode aparecer. */
export const CURSE_FROM = 2;

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
  const kinds: EventKind[] = (['shop', 'press', 'mystic', 'curse'] as EventKind[])
    .filter((k) => k !== st.last && (k !== 'mystic' || canMystic) && (k !== 'curse' || depthDone >= CURSE_FROM));
  // peso: os bons valem 2, o Presente do Dono vale 1
  const bag = kinds.flatMap((k) => (k === 'curse' ? [k] : [k, k]));
  const kind = bag.length ? rng.pick(bag) : 'shop';
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

/** As 2 peças malditas que o Dono oferece (diferentes). */
export function curseOffers(rng: Rng): PieceId[] {
  const pool = [...CURSED];
  const out: PieceId[] = [];
  while (out.length < 2 && pool.length) out.push(pool.splice(Math.floor(rng.float() * pool.length), 1)[0]);
  return out;
}
