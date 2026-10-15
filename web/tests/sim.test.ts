import { describe, it, expect, beforeAll } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { generatePhase } from '../src/core/mapgen';
import { Layout } from '../src/core/layout';
import { autoPlan } from '../src/core/bot';
import { Sim } from '../src/game/sim';
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
    const plan = autoPlan(L);
    expect(L.pieces.length).toBeGreaterThan(5);
    const sim = new Sim(spec, L.pieces, 0);
    sim.runHeadless();
    console.log('[P1]', plan, 'pieces', L.pieces.length, 'alive', sim.alive, 'chain', sim.chain, 't', sim.t.toFixed(2));
    expect(sim.win).toBe(true);
    sim.dispose();
  });

  it('bot vence a maioria das fases geradas (prof. 0–11, 4 seeds)', () => {
    let wins = 0, total = 0;
    const rows: string[] = [];
    for (const seed of [1, 7, 99, 1234]) {
      for (let depth = 0; depth < 12; depth++) {
        const deck = deckFor(depth);
        const spec = generatePhase(seed, depth, deck);
        const L = new Layout(spec, deck);
        const plan = autoPlan(L);
        const sim = new Sim(spec, L.pieces, 0);
        sim.runHeadless();
        total++;
        if (sim.win) wins++;
        rows.push(`s${seed} d${depth} squads=${new Set(spec.enemies.map((e) => e.squad)).size} en=${spec.enemies.length} walls=${spec.walls.length} lava=${spec.lava.length} par=${spec.par} used=${L.cardsUsed()} chain=${sim.chain} alive=${sim.alive} win=${sim.win} ${plan.note}`);
        sim.dispose();
      }
    }
    console.log(rows.join('\n'));
    console.log(`[BOT] ${wins}/${total}`);
    expect(wins / total).toBeGreaterThan(0.5);
  }, 120000);
});
