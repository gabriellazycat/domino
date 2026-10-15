import { Layout } from '../core/layout';
import { autoPlan, Strategy } from '../core/bot';
import { PhaseSpec } from '../core/mapgen';
import { Deck } from '../core/pieces';
import { Sim } from './sim';

/** Planeja com cada estratégia do bot e confere na física headless; devolve o melhor plano. */
export function solve(spec: PhaseSpec, deck: Deck): { layout: Layout; win: boolean; alive: number; strategy: Strategy; note: string } {
  let best: { layout: Layout; win: boolean; alive: number; strategy: Strategy; note: string } | null = null;
  for (const strategy of ['comb', 'tree'] as Strategy[]) {
    const layout = new Layout(spec, deck);
    const plan = autoPlan(layout, strategy);
    const sim = new Sim(spec, layout.pieces, 0);
    sim.runHeadless();
    const r = { layout, win: sim.win, alive: sim.alive, strategy, note: plan.note };
    sim.dispose();
    if (!best || r.alive < best.alive) best = r;
    if (r.win) break;
  }
  return best!;
}
