import { describe, it, expect } from 'vitest';
import { commonBudget, commonPacks, draft3, labelFor } from '../src/core/rewards';
import { PIECES } from '../src/core/pieces';
import { Rng } from '../src/core/rng';

const value = (items: { piece: keyof typeof PIECES; count: number }[]) => items.reduce((s, it) => s + PIECES[it.piece].cost * it.count, 0);

describe('recompensas comuns (orçamento de valor)', () => {
  it('começa em 2 e nunca passa de 4', () => {
    expect(commonBudget(0)).toBe(2);
    expect(commonBudget(2)).toBe(2);
    expect(commonBudget(3)).toBe(3);
    expect(commonBudget(9)).toBe(4);
    expect(commonBudget(30)).toBe(4);
  });

  it('no começo: 2 comuns, 1 pesada ou 1 grande (nada de 5 peças)', () => {
    const labels = commonPacks(0).map(labelFor);
    expect(labels).toHaveLength(3);
    expect(commonPacks(0).every((p) => value(p) === 2)).toBe(true);
  });

  it('todo pacote de uma profundidade vale o mesmo orçamento', () => {
    for (const depth of [0, 2, 3, 5, 6, 10]) {
      const b = commonBudget(depth);
      for (const p of commonPacks(depth)) expect(value(p)).toBe(b);
    }
  });

  it('nunca oferece 5 comuns ou 3 especiais na fase 10', () => {
    for (const p of commonPacks(10)) {
      const commons = p.find((it) => it.piece === 'common')?.count ?? 0;
      expect(commons).toBeLessThan(5);
      const specials = p.filter((it) => it.piece !== 'common').reduce((s, it) => s + it.count, 0);
      expect(specials).toBeLessThan(3);
    }
  });

  it('o draft mostra 3 opções distintas da mesma raridade', () => {
    for (let seed = 1; seed < 40; seed++) {
      const opts = draft3(new Rng(seed), 10);
      expect(opts).toHaveLength(3);
      expect(new Set(opts.map((o) => o.rarity)).size).toBe(1);
      expect(new Set(opts.map((o) => o.label)).size).toBe(3);
    }
  });
});
