import { describe, it, expect, beforeAll } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { Sim } from '../src/game/sim';
import type { PhaseSpec, EnemySpec } from '../src/core/mapgen';
import type { Placed } from '../src/core/layout';

// Tocheiro: queima peça em pé que encosta na tocha; peça caindo nele o derruba.
function spec(kind: 'torcher' | 'patroller'): PhaseSpec {
  const e: EnemySpec = { kind, x: -2, z: 0, yaw: Math.PI / 2, squad: 100, patrol: { pts: [{ x: -2, z: 0 }, { x: 2, z: 0 }, { x: 2, z: 0.01 }, { x: -2, z: 0.01 }], speed: 0.8 } };
  return { enemies: [e], walls: [], trigger: { x: 0, z: -3, yaw: 0 } } as unknown as PhaseSpec;
}
const piece = (id: number, x: number, z: number, parent = -1): Placed =>
  ({ id, type: 'common', x, z, yaw: 0, parent } as unknown as Placed);

describe('tocheiro', () => {
  beforeAll(async () => { await RAPIER.init(); });

  it('queima a peça em pé no caminho dele (e o patrulheiro comum só empurra)', () => {
    // raiz longe; uma peça parada em cima da rota do patrulheiro
    const layout = [piece(0, 5, -3), piece(1, -1.4, 0)];
    const burns: number[] = [];
    const sim = new Sim(spec('torcher'), layout, 0, { burn: (i) => burns.push(i) });
    sim.fire();
    for (let i = 0; i < 120 * 4; i++) sim.step();
    expect(burns).toEqual([1]);
    expect(sim.pieces[1].burned).toBeGreaterThan(0);
    expect(sim.pieces[1].body.isEnabled()).toBe(false);
    expect(sim.alive).toBe(1);

    const sim2 = new Sim(spec('patroller'), layout, 0, {});
    sim2.fire();
    for (let i = 0; i < 120 * 4; i++) sim2.step();
    expect(sim2.pieces[1].burned).toBe(-1);
  });

  it('peça caindo em cima dele derruba', () => {
    // corrente em pé apontando para a rota (+z), fora do caminho; ele passa por x≈0 por volta de t=2,5
    const layout = [piece(0, 0, -1.2), piece(1, 0, -0.9, 0), piece(2, 0, -0.6, 1)];
    const sim = new Sim(spec('torcher'), layout, 0, {});
    for (let i = 0; i < 120 * 2.2; i++) sim.step();
    sim.fire();
    for (let i = 0; i < 120 * 4; i++) sim.step();
    expect(sim.pieces.every((s) => s.burned < 0)).toBe(true);
    expect(sim.alive).toBe(0);
  });
});
