import { Rng } from './rng';
import { SealId, SEAL_ORDER } from './cards';
import { BuffId, BUFF_ORDER, Buffs, buffMaxed } from './buffs';
import { PieceId, CURSED } from './pieces';

// Eventos entre as fases (loja, prensa de selos, altar místico e o PRESENTE DO DONO, o único ruim). Regras:
// - nunca dois eventos seguidos (sempre fase → evento → fase);
// - depois da primeira fase (tutorial) não tem evento;
// - os BONS (loja, prensa, altar) têm 40% depois de cada fase, +20% a cada fase que passa sem um evento bom
//   ("sorte com memória"); só um evento bom zera essa conta;
// - o Presente do Dono (maldito) tem a conta DELE: começa em 12% a partir da 3ª fase vencida e sobe 8% a cada fase
//   em que não saiu; só ele mesmo zera, um evento bom não mexe (a chance do azar continua crescendo);
// - o mesmo tipo de evento nunca aparece duas vezes em sequência.
export type EventKind = 'shop' | 'press' | 'mystic' | 'curse';

/** Fase vencida a partir da qual o Presente do Dono pode aparecer. */
export const CURSE_FROM = 2;

export interface EventState {
  /** fases desde o último evento BOM */
  since: number;
  last: EventKind | null;
  /** fases (já elegíveis) desde o último Presente do Dono; ausente em saves antigos = 0 */
  curseSince?: number;
}

export const EVENT_BASE = 0.4;
export const EVENT_STEP = 0.2;
export const CURSE_BASE = 0.12;
export const CURSE_STEP = 0.08;

export function eventChance(since: number): number {
  return Math.min(1, EVENT_BASE + EVENT_STEP * Math.max(0, since));
}

export function curseChance(since: number): number {
  return Math.min(1, CURSE_BASE + CURSE_STEP * Math.max(0, since));
}

/**
 * Decide se vem um evento depois da fase `depthDone` (0 = primeira) e qual. Atualiza `st`.
 * `canMystic`: ainda existe bênção para comprar.
 */
export function rollEvent(st: EventState, depthDone: number, rng: Rng, canMystic: boolean): EventKind | null {
  if (depthDone < 1) return null;
  // 1) o Presente do Dono, com a conta própria
  const curseOk = depthDone >= CURSE_FROM;
  const cs = st.curseSince ?? 0;
  if (curseOk && st.last !== 'curse' && rng.float() < curseChance(cs)) {
    st.curseSince = 0;
    st.last = 'curse';
    return 'curse';
  }
  if (curseOk) st.curseSince = cs + 1; // não saiu: a chance dele sobe
  // 2) os eventos bons
  if (rng.float() >= eventChance(st.since)) { st.since++; return null; }
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

/** As 2 peças malditas que o Dono oferece (diferentes). */
export function curseOffers(rng: Rng): PieceId[] {
  const pool = [...CURSED];
  const out: PieceId[] = [];
  while (out.length < 2 && pool.length) out.push(pool.splice(Math.floor(rng.float() * pool.length), 1)[0]);
  return out;
}
