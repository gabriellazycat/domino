import { describe, it, expect, beforeAll } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { EnemySpec, GateSpec, PhaseSpec, WallSpec } from '../src/core/mapgen';
import { Layout, Stroke } from '../src/core/layout';
import { Sim } from '../src/game/sim';
import { emptyDeck } from '../src/core/pieces';
import { Kind } from '../src/core/cards';

beforeAll(async () => { await RAPIER.init(); });

// Arqueiro (uma flecha), Ogro (pisoteia; derrubado, tomba e esmaga a faixa) e Porteira com alavanca.
function spec(enemies: EnemySpec[], walls: WallSpec[] = [], gates: GateSpec[] = []): PhaseSpec {
  return { depth: 6, seed: 1, title: 't', subtitle: '', trigger: { x: -6.6, z: 0, yaw: Math.PI / 2 }, enemies, walls, gates, par: 40, boss: false };
}
const E = (kind: EnemySpec['kind'], x: number, z: number, squad = 0): EnemySpec => ({ kind, x, z, yaw: -Math.PI / 2, squad });

function layout(s: PhaseSpec) {
  const d = emptyDeck(); d.common = 60; d.runner = 2; d.fork = 2; d.heavy = 3;
  return new Layout(s, d);
}
/** Estende `kind` em direção ao ponto (várias peças, curvando); devolve quantas colocou. */
function to(L: Layout, st: Stroke, x: number, z: number, kind: Kind = 'common') {
  return L.extend(st, x, z, kind).placed.length;
}
function sim(L: Layout, offset = 0) {
  const s = new Sim(L.spec, L.pieces, offset);
  s.runHeadless();
  return s;
}

describe('Arqueiro', () => {
  it('a 1ª peça que se mexe no círculo leva a flecha e a corrente morre ali', () => {
    const L = layout(spec([E('archer', 0, 0, 200)]));
    const st = L.begin(-6.6, 0, 'common').stroke!;
    to(L, st, -0.4, 0);
    const s = sim(L);
    expect(s.enemies[0].arrowUsed).toBe(true);
    expect(s.alive).toBe(1);
    expect(s.pieces.filter((p) => p.burned >= 0).length).toBe(2);
    s.dispose();
  });

  it('com isca da Bifurcação: um ramo gasta a flecha, o outro derruba o arqueiro', () => {
    const L = layout(spec([E('archer', 0, 0, 200)]));
    const st = L.begin(-6.6, 0, 'common').stroke!;
    to(L, st, -3.6, 0);
    to(L, st, -3.2, 0, 'fork');
    const [a, b] = L.heads().sort((p, q) => q.z - p.z);
    // isca: reto para dentro do círculo, logo
    to(L, { head: a.id, done: false, id: 90 }, -1.9, 0.6);
    // ramo principal: dá a volta por baixo (fora do alcance) e só depois entra
    const sb: Stroke = { head: b.id, done: false, id: 91 };
    to(L, sb, -3.0, -2.6);
    to(L, sb, -1.0, -2.9);
    to(L, sb, -0.1, -0.5);
    const s = sim(L);
    expect(s.enemies[0].arrowUsed).toBe(true);
    expect(s.win).toBe(true);
    s.dispose();
  });

  it('o Foguete correndo é imune à flecha e atropela o arqueiro', () => {
    const L = layout(spec([E('archer', 0, 0, 200)]));
    const st = L.begin(-6.6, 0, 'common').stroke!;
    to(L, st, -2.9, 0);
    to(L, st, -2.4, 0, 'runner');
    const s = sim(L);
    expect(s.win).toBe(true);
    s.dispose();
  });
});

describe('Ogro', () => {
  it('pisoteia a peça em pé que estiver na rota dele', () => {
    // rota em linha (vai e volta) cruzando a corrente em x = -3
    const ogre: EnemySpec = { kind: 'ogre', x: -3, z: -0.8, yaw: 0, squad: 100, patrol: { pts: [{ x: -3, z: -0.8 }, { x: -3, z: 2.5 }], speed: 0.6 } };
    const L = layout(spec([ogre, E('soldier', 3, 3.5)]));
    const st = L.begin(-6.6, 0, 'common').stroke!;
    to(L, st, -1.5, 0);
    const s = new Sim(L.spec, L.pieces, 0);
    s.fire();
    for (let i = 0; i < 120 * 6 && !s.done; i++) s.step();
    expect(s.pieces.some((p) => p.crushed >= 0)).toBe(true);
    s.dispose();
  });

  it('derrubado (Pesada), tomba como dominó gigante e esmaga quem está na frente', () => {
    const ogre: EnemySpec = { kind: 'ogre', x: -2, z: 0, yaw: 0, squad: 100, patrol: { pts: [{ x: -2, z: 0 }, { x: -2, z: 0.02 }], speed: 0.01 } };
    const L = layout(spec([ogre, E('soldier', -0.6, 0, 0), E('soldier', -0.5, 0.5, 1)]));
    const st = L.begin(-6.6, 0, 'common').stroke!;
    to(L, st, -3.2, 0);
    to(L, st, -2.75, 0, 'heavy');
    const s = sim(L);
    expect(s.enemies[0].alive).toBe(false);
    expect(s.win).toBe(true);
    s.dispose();
  });
});

describe('Porteira com alavanca', () => {
  // muro em x = -2 com uma grade no meio; soldado atrás; alavanca acima do caminho
  const wallN: WallSpec = { x: -2, z: 2.1, w: 0.28, d: 3.0, h: 0.55, style: 'stone' };
  const wallS: WallSpec = { x: -2, z: -2.1, w: 0.28, d: 3.0, h: 0.55, style: 'stone' };
  const gate: GateSpec = { x: -2, z: 0, w: 0.12, d: 1.2, h: 0.65, open: 3, lever: { x: -3.4, z: 1.7 } };

  function plan(withLever: boolean) {
    const L = layout(spec([E('soldier', -0.6, 0)], [wallN, wallS], [gate]));
    const st = L.begin(-6.6, 0, 'common').stroke!;
    to(L, st, -5.2, 0);
    to(L, st, -4.8, 0, 'fork');
    const [a, b] = L.heads().sort((p, q) => q.z - p.z);
    if (withLever) to(L, { head: a.id, done: false, id: 90 }, gate.lever.x, gate.lever.z);
    const sb: Stroke = { head: b.id, done: false, id: 91 };
    to(L, sb, -0.9, 0);
    return L;
  }

  it('fechada: a corrente bate na grade e para', () => {
    const s = sim(plan(false));
    expect(s.win).toBe(false);
    s.dispose();
  });

  it('um ramo derruba a alavanca, a grade afunda e o outro ramo passa', () => {
    const s = sim(plan(true));
    expect(s.gates[0].openAt).toBeGreaterThanOrEqual(0);
    expect(s.win).toBe(true);
    s.dispose();
  });
});
