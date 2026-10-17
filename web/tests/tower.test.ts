import { describe, it, expect, beforeAll } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { PhaseSpec, WallSpec } from '../src/core/mapgen';
import { Layout, Stroke, LONG_TURN } from '../src/core/layout';
import { Sim } from '../src/game/sim';
import { emptyDeck, PIECES } from '../src/core/pieces';

beforeAll(async () => { await RAPIER.init(); });

// Torre = peça de alcance: a próxima peça nasce a `PIECES.tower.step` dela e a queda a derruba.
function spec(walls: WallSpec[] = []): PhaseSpec {
  return {
    depth: 1, seed: 1, title: 't', subtitle: '', trigger: { x: -6.6, z: 0, yaw: Math.PI / 2 },
    enemies: [{ kind: 'soldier', x: 2.5, z: 0, yaw: -Math.PI / 2, squad: 0 }],
    walls, par: 30, boss: false,
  };
}

function deck() { const d = emptyDeck(); d.common = 40; d.tower = 4; return d; }

/** Comuns até `x`, depois uma peça do tipo pedido (uma só: o cursor fica a um passo da ponta). */
function lay(L: Layout, st: Stroke, x: number, kind: 'common' | 'tower') {
  const h = L.get(st.head)!;
  const target = kind === 'tower' ? h.x + PIECES[h.type].step : x;
  return L.extend(st, target, 0, kind);
}

describe('Torre de alcance', () => {
  it('a peça depois da Torre nasce longe, e a onda passa por ela até o inimigo', () => {
    const L = new Layout(spec(), deck());
    const b = L.begin(-6.6, 0, 'common');
    const st = b.stroke!;
    lay(L, st, -5.4, 'common');
    lay(L, st, 0, 'tower');
    const tower = L.get(st.head)!;
    expect(tower.type).toBe('tower');
    lay(L, st, -2.2, 'common');
    const after = L.children(tower.id)[0];
    expect(Math.hypot(after.x - tower.x, after.z - tower.z)).toBeCloseTo(PIECES.tower.step, 2);
    lay(L, st, 0, 'tower');
    lay(L, st, 2.0, 'common');

    const sim = new Sim(L.spec, L.pieces, 0);
    sim.runHeadless();
    expect(sim.chain).toBe(L.pieces.length);
    expect(sim.win).toBe(true);
    sim.dispose();
  });

  it('muro no meio da queda da Torre bloqueia a próxima peça', () => {
    const wall: WallSpec = { x: -4.4, z: 0, w: 0.3, d: 2, h: 0.6, style: 'stone' };
    const L = new Layout(spec([wall]), deck());
    const st = L.begin(-6.6, 0, 'common').stroke!;
    lay(L, st, -5.4, 'common');
    lay(L, st, 0, 'tower');
    expect(L.get(st.head)!.type).toBe('tower');
    const r = L.extend(st, -3.0, 0, 'common');
    expect(r.placed.length).toBe(0);
    expect(r.fail).toBe('wall');
  });
});

describe('Torre: curva depois dela', () => {
  it('a peça depois da Torre vira no máximo LONG_TURN, e Torre depois de Torre vai reta', () => {
    const L = new Layout(spec(), deck());
    const st = L.begin(-6.6, 0, 'common').stroke!;
    lay(L, st, -5.4, 'common');
    lay(L, st, 0, 'tower');
    const t1 = L.get(st.head)!;
    L.extend(st, t1.x + 1.2, 3, 'tower'); // cursor bem para o lado
    const t2 = L.get(st.head)!;
    expect(t2.type).toBe('tower');
    expect(t2.yaw).toBeCloseTo(t1.yaw, 5);
    L.extend(st, t2.x + 1.2, 3, 'common');
    const c = L.children(t2.id)[0];
    expect(Math.abs(c.yaw - t2.yaw)).toBeLessThanOrEqual(LONG_TURN + 1e-6);
  });
});
