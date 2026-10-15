import { Rng } from './rng';
import { Deck, deckTotal, emptyDeck, PieceId } from './pieces';
import { RULES } from './rules';
import { RewardItem } from './rewards';

// Estado da run (puro, serializável). Run infinita: profundidade sobe até a vida acabar.
export interface RunStats { knocked: number; bestCombo: number; phasesWon: number; stars: number; explosions: number }
export interface RunState {
  version: 1;
  seed: number;
  depth: number;
  life: number;
  maxLife: number;
  gold: number;
  deck: Deck;
  extraAttemptsNext: number;
  rngState: number;
  stats: RunStats;
}

export function newRun(seed: number): RunState {
  const deck = emptyDeck();
  deck.common = RULES.startingCommons;
  deck.fork = RULES.startingForks;
  return {
    version: 1, seed: seed >>> 0, depth: 0,
    life: RULES.startingLife, maxLife: RULES.startingLife,
    gold: 0, deck, extraAttemptsNext: 0,
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

export function addItems(run: RunState, items: RewardItem[]) {
  for (const it of items) run.deck[it.piece] += it.count;
}

export function cardCount(run: RunState): number { return deckTotal(run.deck); }

export function damage(run: RunState, survivors: number): number {
  const d = survivors * RULES.damagePerSurvivor;
  run.life = Math.max(0, run.life - d);
  return d;
}

const KEY = 'topple.autosave.v1';

export function saveRun(run: RunState) {
  try { localStorage.setItem(KEY, JSON.stringify(run)); } catch { /* sem storage: segue sem save */ }
}
export function loadRun(): RunState | null {
  try {
    const s = localStorage.getItem(KEY);
    if (!s) return null;
    const r = JSON.parse(s) as RunState;
    return r && r.version === 1 && r.life > 0 ? r : null;
  } catch { return null; }
}
export function clearSave() { try { localStorage.removeItem(KEY); } catch { /* ok */ } }

export function deckEntries(deck: Deck): [PieceId, number][] {
  return (Object.keys(deck) as PieceId[]).filter((k) => deck[k] > 0).map((k) => [k, deck[k]]);
}
