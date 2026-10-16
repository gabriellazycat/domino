import { describe, it, expect } from 'vitest';
import { DrawPile } from '../src/core/draw';
import { Layout } from '../src/core/layout';
import { generatePhase } from '../src/core/mapgen';
import { Rng } from '../src/core/rng';
import { emptyDeck } from '../src/core/pieces';
import { Card, cardsFromDeck, kindOf, canSeal } from '../src/core/cards';
import { rollEvent, EventState, eventChance } from '../src/core/events';
import { newRun, loadRun, saveRun } from '../src/core/run';

const spec = () => { const d = emptyDeck(); d.common = 14; d.fork = 1; return generatePhase(42, 0, d); };
/** caixa de 15 Comuns em que as primeiras `seals.length` ganham os selos dados */
function cards(seals: Card['seals'][] = []): Card[] {
  const d = emptyDeck(); d.common = 15;
  const cs = cardsFromDeck(d);
  seals.forEach((s, i) => { cs[i].seals = s; });
  return cs;
}
const layoutWith = (cs: Card[], seed = 3) => new Layout(spec(), emptyDeck(), DrawPile.fromCards(cs, new Rng(seed)));

describe('selos', () => {
  it('Primeira sempre vem na primeira mão', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const L = layoutWith(cards([['first'], ['first']]), seed);
      const drawn = L.newHand(7)!;
      expect(drawn.filter((c) => c.seals.includes('first')).length).toBe(2);
    }
  });

  it('Guardada fica na mão na Nova mão', () => {
    const L = layoutWith(cards([['guard', 'first']]));
    L.newHand(7);
    L.newHand(7);
    expect(L.entries.some((e) => e.card.seals.includes('guard'))).toBe(true);
    expect(L.handCount()).toBe(8);
  });

  it('Sortuda traz mais uma peça', () => {
    const L = layoutWith(cards([['lucky', 'first']]));
    expect(L.newHand(7)!.length).toBe(8);
  });

  it('Dupla põe duas peças na mesa com uma carta só', () => {
    const L = layoutWith(cards([['double', 'first']]));
    L.newHand(7);
    const kind = kindOf({ type: 'common', seals: ['double', 'first'] });
    expect(L.uses(kind)).toBe(2);
    const t = L.spec.trigger;
    const far = { x: t.x + Math.sin(t.yaw) * 0.45, z: t.z + Math.cos(t.yaw) * 0.45 };
    const r = L.trail(null, t, far, kind);
    expect(r.placed.length).toBe(2);
    expect(L.uses(kind)).toBe(0);
    expect(new Set(r.placed.map((p) => p.card!.uid)).size).toBe(1);
    // desfazer devolve a carta com os 2 usos
    L.undoStroke();
    expect(L.uses(kind)).toBe(2);
  });

  it('Reciclagem devolve as sobras para a caixa na primeira Nova mão', () => {
    const L = layoutWith(cards());
    L.recycle = true;
    L.newHand(7);
    L.newHand(7);
    expect(L.pile!.discard.length).toBe(0);
    expect(L.pile!.size + L.handCount()).toBe(15);
    L.newHand(7);
    expect(L.pile!.discard.length).toBe(7);
  });

  it('no máximo 2 selos, sem repetir', () => {
    const c: Card = { uid: 1, type: 'common', seals: ['gold'] };
    expect(canSeal(c, 'gold')).toBe(false);
    expect(canSeal(c, 'lucky')).toBe(true);
    c.seals.push('lucky');
    expect(canSeal(c, 'first')).toBe(false);
  });
});

describe('eventos entre as fases', () => {
  it('nunca depois da primeira fase; chance cresce sem evento; tipo nunca repete', () => {
    expect(eventChance(0)).toBeCloseTo(0.4);
    expect(eventChance(3)).toBe(1);
    const rng = new Rng(77);
    const st: EventState = { since: 0, last: null };
    expect(rollEvent(st, 0, rng, true)).toBe(null);
    let last: string | null = null, gaps = 0, maxGap = 0, events = 0;
    for (let d = 1; d < 400; d++) {
      const k = rollEvent(st, d, rng, true);
      if (k) { expect(k).not.toBe(last); last = k; events++; maxGap = Math.max(maxGap, gaps); gaps = 0; } else gaps++;
    }
    expect(maxGap).toBeLessThanOrEqual(3);
    expect(events).toBeGreaterThan(100);
  });
});

describe('save', () => {
  it('save antigo (v1) vira v2 com peças sem selo', () => {
    const store = new Map<string, string>();
    (globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v), removeItem: (k: string) => store.delete(k) };
    const d = emptyDeck(); d.common = 9; d.heavy = 2;
    const { cards: _c, nextUid: _n, buffs: _b, events: _e, ...rest } = newRun(5);
    store.set('topple.autosave.v1', JSON.stringify({ ...rest, version: 1, deck: d }));
    const r = loadRun()!;
    expect(r.version).toBe(2);
    expect(r.cards.length).toBe(11);
    expect(r.cards.every((c) => c.seals.length === 0)).toBe(true);
    saveRun(r);
    expect(loadRun()!.cards.length).toBe(11);
  });
});
