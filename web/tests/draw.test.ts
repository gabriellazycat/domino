import { describe, it, expect } from 'vitest';
import { DrawPile } from '../src/core/draw';
import { Layout } from '../src/core/layout';
import { generatePhase } from '../src/core/mapgen';
import { Rng } from '../src/core/rng';
import { emptyDeck, deckTotal } from '../src/core/pieces';

const deck = () => { const d = emptyDeck(); d.common = 14; d.fork = 1; d.heavy = 2; return d; };

describe('baralho de compra', () => {
  it('cada peça sai exatamente uma vez e a mesma seed repete a ordem', () => {
    const a = DrawPile.fromDeck(deck(), new Rng(5)), b = DrawPile.fromDeck(deck(), new Rng(5));
    expect(a.pile).toEqual(b.pile);
    expect(a.draw(100).length).toBe(deckTotal(deck()));
    expect(a.size).toBe(0);
  });

  it('retry reembaralha baralho + descarte', () => {
    const p = DrawPile.fromDeck(deck(), new Rng(5));
    p.discardAll(p.draw(7));
    p.reshuffleRemaining();
    expect(p.size).toBe(deckTotal(deck()));
    expect(p.discard.length).toBe(0);
  });
});

describe('layout com mão', () => {
  const mk = () => {
    const d = deck();
    const spec = generatePhase(42, 0, d);
    const L = new Layout(spec, d, DrawPile.fromDeck(d, new Rng(3)));
    L.newHand(7);
    return L;
  };

  it('compra 7, Nova mão descarta o resto e compra mais', () => {
    const L = mk();
    expect(L.handCount()).toBe(7);
    expect(L.newHand(7)?.length).toBe(7);
    expect(L.handCount()).toBe(7);
    expect(L.pile!.discard.length).toBe(7);
    expect(L.pile!.size).toBe(3);
  });

  it('com o baralho vazio não há nova mão', () => {
    const L = mk();
    L.newHand(7); L.newHand(7);
    expect(L.handCount()).toBe(3);
    expect(L.newHand(7)).toBe(null);
  });

  it('peças de mãos anteriores ficam fixas; desfazer e limpar só valem para a mão atual', () => {
    const L = mk();
    const t = L.spec.trigger;
    const far = (d: number) => ({ x: t.x + Math.sin(t.yaw) * d, z: t.z + Math.cos(t.yaw) * d });
    const first = L.trail(null, t, far(1.2), 'common');
    expect(first.placed.length).toBeGreaterThan(1);
    const n1 = L.pieces.length;
    L.newHand(7);
    expect(L.undoStroke()).toEqual([]);
    expect(L.clear()).toEqual([]);
    expect(L.removeHead(L.heads()[0].id)).toEqual([]);
    const head = L.heads()[0];
    L.trail(L.begin(head.x, head.z, 'common').stroke!, head, far(2.6), 'common');
    const n2 = L.pieces.length;
    expect(n2).toBeGreaterThan(n1);
    const back = L.handCount();
    expect(L.clear().length).toBe(n2 - n1);
    expect(L.pieces.length).toBe(n1);
    expect(L.handCount()).toBe(back + (n2 - n1));
  });

});
