import { describe, it, expect, beforeAll } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { generatePhase } from '../src/core/mapgen';
import { Layout } from '../src/core/layout';
import { autoPlan } from '../src/core/bot';
import { Sim } from '../src/game/sim';
import { solve } from '../src/game/solver';
import { emptyDeck, Deck } from '../src/core/pieces';

beforeAll(async () => { await RAPIER.init(); });

function deckFor(depth: number): Deck {
  // baralho "típico": base + 1 recompensa por fase (comuns escalados, pesadas, grandes, bifurcações)
  const d = emptyDeck();
  d.common = 14 + Array.from({ length: depth }, (_, i) => 5 + i).reduce((a, b) => a + b, 0) * 0.6 | 0;
  d.fork = 1 + Math.floor(depth / 3);
  d.heavy = Math.floor(depth / 2);
  d.big = Math.floor(depth / 3);
  d.blast = depth >= 4 ? 2 : 0;
  return d;
}

describe('física + bot', () => {
  it('corrente reta derruba o pelotão da fase 1', () => {
    const spec = generatePhase(42, 0, deckFor(0));
    const L = new Layout(spec, deckFor(0));
    autoPlan(L);
    expect(L.pieces.length).toBeGreaterThan(5);
    const sim = new Sim(spec, L.pieces, 0);
    sim.runHeadless();
    expect(sim.win).toBe(true);
    expect(sim.chain).toBe(L.pieces.length); // a onda passa por todas as peças
    sim.dispose();
  });

  it('as 3 fases de tutorial são vencidas pelo bot em várias seeds', () => {
    for (const seed of [1, 7, 99, 1234, 5]) {
      for (let depth = 0; depth < 3; depth++) {
        const r = solve(generatePhase(seed, depth, deckFor(depth)), deckFor(depth));
        expect(r.win, `seed ${seed} prof ${depth}: ${r.note}`).toBe(true);
      }
    }
  }, 120000);

  it('bateria de fases geradas (prof. 0–11): o bot vence uma boa parte sozinho', () => {
    let wins = 0, total = 0;
    const rows: string[] = [];
    for (const seed of [1, 7, 99, 1234]) {
      for (let depth = 0; depth < 12; depth++) {
        const deck = deckFor(depth);
        const spec = generatePhase(seed, depth, deck);
        const r = solve(spec, deck);
        total++;
        if (r.win) wins++;
        rows.push(`s${seed} d${depth} en=${spec.enemies.length} walls=${spec.walls.length} lava=${spec.lava.length} par=${spec.par} used=${r.layout.cardsUsed()} alive=${r.alive} win=${r.win} [${r.strategy}] ${r.note}`);
      }
    }
    console.log(rows.join('\n'));
    console.log(`[BOT] ${wins}/${total}`);
    // o bot é bem pior que um humano (não usa retry nem ajuste fino); serve de trava contra regressão
    expect(wins / total).toBeGreaterThan(0.4);
  }, 300000);
});
