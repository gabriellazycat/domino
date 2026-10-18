import { describe, it, expect } from 'vitest';
import { PhaseSpec } from '../src/core/mapgen';
import { Layout } from '../src/core/layout';
import { emptyDeck } from '../src/core/pieces';

// A 1ª peça (no gatilho) gira para onde o jogador aponta, em vez de sair sempre para a frente.
function spec(): PhaseSpec {
  return {
    depth: 1, seed: 1, title: 't', subtitle: '', trigger: { x: -6.6, z: 0, yaw: Math.PI / 2 },
    enemies: [{ kind: 'soldier', x: 2.5, z: 0, yaw: -Math.PI / 2, squad: 0 }],
    walls: [], par: 30, boss: false,
  };
}

function deck() { const d = emptyDeck(); d.common = 40; return d; }

describe('mira da primeira peça', () => {
  it('sem mira, a 1ª peça usa o ângulo do gatilho (bot e testes antigos)', () => {
    const L = new Layout(spec(), deck());
    const b = L.begin(-6.6, 0, 'common');
    expect(b.placed![0].yaw).toBeCloseTo(Math.PI / 2, 5);
  });

  it('a 1ª peça aponta para o cursor quando ele está longe do gatilho', () => {
    const L = new Layout(spec(), deck());
    // cursor para o lado: +z (ângulo 0 na convenção sin/cos do jogo)
    const b = L.begin(-6.6, 0, 'common', { x: -6.6, z: 3 });
    expect(b.placed![0].yaw).toBeCloseTo(0, 5);
  });

  it('a 1ª peça gira junto com o cursor (45°)', () => {
    const L = new Layout(spec(), deck());
    const b = L.begin(-6.6, 0, 'common', { x: -5.6, z: 1 });
    expect(b.placed![0].yaw).toBeCloseTo(Math.atan2(1, 1), 5);
  });

  it('com o cursor colado no gatilho, vale o ângulo do gatilho', () => {
    const L = new Layout(spec(), deck());
    const b = L.begin(-6.6, 0, 'common', { x: -6.6, z: 0.2 });
    expect(b.placed![0].yaw).toBeCloseTo(Math.PI / 2, 5);
  });

  it('a trilha inteira segue a direção apontada pelo cursor', () => {
    const L = new Layout(spec(), deck());
    const r = L.trail(null, { x: -6.6, z: 0 }, { x: -6.6, z: 2.5 }, 'common');
    expect(r.placed.length).toBeGreaterThan(1);
    // a primeira peça já está apontando para +z, e as seguintes seguem o mesmo lado
    expect(r.placed[0].yaw).toBeCloseTo(0, 5);
    expect(Math.abs(r.placed[r.placed.length - 1].x + 6.6)).toBeLessThan(0.5);
    expect(r.placed[r.placed.length - 1].z).toBeGreaterThan(1);
  });
});
