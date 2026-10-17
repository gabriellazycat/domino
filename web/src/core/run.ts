import { Rng } from './rng';
import { Deck, PieceId, emptyDeck } from './pieces';
import { RULES } from './rules';
import { RewardItem } from './rewards';
import { Card, cardsFromDeck, deckOf } from './cards';
import { Buffs } from './buffs';
import { EventState } from './events';

// Estado da run (puro, serializável). Run infinita: profundidade sobe até a vida acabar.
export interface RunStats { knocked: number; bestCombo: number; phasesWon: number; stars: number; explosions: number }
export interface RunState {
  version: 2;
  seed: number;
  depth: number;
  life: number;
  maxLife: number;
  gold: number;
  /** todas as peças da caixa (cada uma com seus selos) */
  cards: Card[];
  nextUid: number;
  /** bênçãos do altar místico */
  buffs: Buffs;
  /** agenda de eventos entre as fases */
  events: EventState;
  extraAttemptsNext: number;
  rngState: number;
  stats: RunStats;
}

export function newRun(seed: number): RunState {
  const deck = emptyDeck();
  deck.common = RULES.startingCommons;
  deck.fork = RULES.startingForks;
  const cards = cardsFromDeck(deck, 1);
  return {
    version: 2, seed: seed >>> 0, depth: 0,
    life: RULES.startingLife, maxLife: RULES.startingLife,
    gold: 0, cards, nextUid: cards.length + 1, buffs: {}, events: { since: 0, last: null },
    extraAttemptsNext: 0,
    rngState: new Rng(seed ^ 0xa5a5a5a5).state,
    stats: { knocked: 0, bestCombo: 0, phasesWon: 0, stars: 0, explosions: 0 },
  };
}

export function runRng(run: RunState): Rng {
  const r = new Rng(1);
  r.state = run.rngState;
  return r;
}

export function saveRng(run: RunState, r: Rng) { run.rngState = r.state; }

/** Contagem por tipo (gerador de fases, recompensas). */
export function runDeck(run: RunState): Deck { return deckOf(run.cards); }

export function addCard(run: RunState, type: PieceId): Card {
  const c: Card = { uid: run.nextUid++, type, seals: [] };
  run.cards.push(c);
  return c;
}

export function addItems(run: RunState, items: RewardItem[]) {
  for (const it of items) for (let i = 0; i < it.count; i++) addCard(run, it.piece);
}

export function removeCard(run: RunState, uid: number) {
  run.cards = run.cards.filter((c) => c.uid !== uid);
}

export function cardCount(run: RunState): number { return run.cards.length; }

export function damage(run: RunState, survivors: number): number {
  const d = survivors * RULES.damagePerSurvivor;
  run.life = Math.max(0, run.life - d);
  return d;
}

const KEY = 'topple.autosave.v1';

export function saveRun(run: RunState) {
  try { localStorage.setItem(KEY, JSON.stringify(run)); } catch { /* sem storage: segue sem save */ }
}

/** Save da versão 1 (baralho = contagem por tipo, sem selos/bênçãos/eventos) → versão 2; Grande → Torre. */
function migrate(r: any): RunState | null {
  if (!r || typeof r !== 'object') return null;
  if (r.version === 2) {
    // a Grande saiu do jogo (16/out/2026): vira Torre, mantendo uid e selos
    for (const c of r.cards ?? []) if (c.type === 'big') c.type = 'tower';
    return r as RunState;
  }
  if (r.version !== 1 || !r.deck) return null;
  if (r.deck.big) { r.deck.tower = (r.deck.tower ?? 0) + r.deck.big; delete r.deck.big; }
  const cards = cardsFromDeck(r.deck as Deck, 1);
  const { deck: _old, ...rest } = r;
  return { ...rest, version: 2, cards, nextUid: cards.length + 1, buffs: {}, events: { since: 0, last: null } } as RunState;
}

export function loadRun(): RunState | null {
  try {
    const s = localStorage.getItem(KEY);
    if (!s) return null;
    const r = migrate(JSON.parse(s));
    return r && r.life > 0 && r.cards.length > 0 ? r : null;
  } catch { return null; }
}
export function clearSave() { try { localStorage.removeItem(KEY); } catch { /* ok */ } }
