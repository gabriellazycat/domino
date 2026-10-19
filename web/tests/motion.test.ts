import { describe, it, expect, beforeAll } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { EnemySpec, PhaseSpec, WallSpec } from '../src/core/mapgen';
import { Layout, Stroke } from '../src/core/layout';
import { Sim } from '../src/game/sim';
import { emptyDeck } from '../src/core/pieces';
import { Kind } from '../src/core/cards';
import { runnerPath, launchOf, JUMP_DIST } from '../src/core/motion';

beforeAll(async () => { await RAPIER.init(); });

// Foguete (corrida no chão, quica nos muros) e Saltadora/Mola (salto por cima): a próxima peça nasce
// onde o movimento termina, e na física a onda chega nela.
function spec(enemies: EnemySpec[], walls: WallSpec[] = []): PhaseSpec {
  return { depth: 3, seed: 1, title: 't', subtitle: '', trigger: { x: -6.6, z: 0, yaw: Math.PI / 2 }, enemies, walls, par: 30, boss: false };
}
const soldier = (x: number, z: number, squad = 0): EnemySpec => ({ kind: 'soldier', x, z, yaw: -Math.PI / 2, squad });

function layout(s: PhaseSpec) {
  const d = emptyDeck(); d.common = 40; d.runner = 3; d.jumper = 3; d.tower = 2;
  return new Layout(s, d);
}
/** Uma peça só do tipo pedido, saindo da ponta na direção atual. */
function one(L: Layout, st: Stroke, kind: Kind) {
  const h = L.get(st.head)!;
  const o = launchOf(h, L.spec);
  const far = o.kind === 'run' ? 1.2 : o.step * 1.02;
  const a = o.kind === 'run' ? o.yaw : h.yaw;
  const r = L.extend(st, o.kind === 'run' ? o.x + Math.sin(a) * far : h.x + Math.sin(a) * far, o.kind === 'run' ? o.z + Math.cos(a) * far : h.z + Math.cos(a) * far, kind);
  expect(r.placed.length, `colocar ${kind}: ${r.fail}`).toBeGreaterThan(0);
  return r.placed[0];
}
/** Comuns em linha até encostar no inimigo (ou `n` peças). */
function upTo(L: Layout, st: Stroke, n: number) {
  for (let i = 0; i < n; i++) {
    const h = L.get(st.head)!;
    const o = launchOf(h, L.spec);
    const a = o.kind === 'fall' ? h.yaw : o.yaw;
    const bx = o.kind === 'fall' ? h.x : o.x, bz = o.kind === 'fall' ? h.z : o.z;
    const far = o.kind === 'run' ? 1.2 : o.step * 1.02;
    if (!L.extend(st, bx + Math.sin(a) * far, bz + Math.cos(a) * far, 'common').placed.length) return;
  }
}
function run(L: Layout) {
  const sim = new Sim(L.spec, L.pieces, 0);
  sim.runHeadless();
  const out = { win: sim.win, alive: sim.alive, chain: sim.chain };
  sim.dispose();
  return out;
}

describe('Foguete', () => {
  it('atropela quem está na linha e a corrente continua onde ele para', () => {
    // soldado 1 no meio da corrida; soldado 2 mais à frente, alcançado pelas Comuns depois do Foguete
    const L = layout(spec([soldier(-3.4, 0, 0), soldier(-0.6, 0, 1)]));
    const st = L.begin(-6.6, 0, 'common').stroke!;
    one(L, st, 'common');
    const r = one(L, st, 'runner');
    const path = runnerPath(L.spec, r.x, r.z, r.yaw);
    expect(path.len).toBeGreaterThan(3);
    const after = one(L, st, 'common');
    expect(after.x).toBeGreaterThan(path.end.x);
    upTo(L, st, 12);
    const res = run(L);
    expect(res.alive).toBe(0);
  });

  it('quica no muro: o trajeto dobra e a peça seguinte nasce depois do quique', () => {
    // muro atravessado na frente, girado 45°: o Foguete sai de lado
    const wall: WallSpec = { x: -3.6, z: 0, w: 0.3, d: 2.4, h: 0.55, style: 'stone', yaw: Math.PI / 4 };
    const s = spec([soldier(5, 4)], [wall]);
    const L = layout(s);
    const st = L.begin(-6.6, 0, 'common').stroke!;
    one(L, st, 'common'); one(L, st, 'common');
    const r = one(L, st, 'runner');
    const path = runnerPath(s, r.x, r.z, r.yaw);
    expect(path.pts.length).toBeGreaterThan(2);
    expect(Math.abs(path.end.z)).toBeGreaterThan(0.8);
    const after = one(L, st, 'common');
    one(L, st, 'common');
    const sim = new Sim(L.spec, L.pieces, 0);
    sim.runHeadless();
    const idx = L.pieces.findIndex((p) => p.id === after.id);
    expect(sim.pieces[idx].fallen).toBe(true);
    sim.dispose();
  });
});

describe('anel de continuação', () => {
  it('Torre, Foguete e Saltadora: o anel fica onde a próxima peça nasce e clicar nele continua a corrente', () => {
    for (const kind of ['tower', 'runner', 'jumper'] as Kind[]) {
      const L = layout(spec([]));
      const st = L.begin(-6.6, 0, 'common').stroke!;
      one(L, st, 'common');
      const h = one(L, st, kind);
      const a = L.anchorOf(h);
      expect(Math.hypot(a.x - h.x, a.z - h.z), `${kind}: anel longe da peça`).toBeGreaterThan(0.9);
      // clicar exatamente no anel escolhe esta ponta
      expect(L.begin(a.x, a.z, 'common').stroke?.head, `${kind}: clique no anel`).toBe(h.id);
      // e a peça seguinte nasce justamente no anel
      const next = one(L, st, 'common');
      expect(Math.hypot(next.x - a.x, next.z - a.z), `${kind}: próxima peça no anel`).toBeLessThan(0.06);
    }
  });

  it('peça comum: o anel continua logo à frente dela (como antes)', () => {
    const L = layout(spec([]));
    const st = L.begin(-6.6, 0, 'common').stroke!;
    const h = one(L, st, 'common');
    const a = L.anchorOf(h);
    expect(Math.hypot(a.x - h.x, a.z - h.z)).toBeLessThan(0.3);
    expect(L.begin(h.x, h.z, 'common').stroke?.head).toBe(h.id);
  });
});

describe('Saltadora', () => {
  it('pula o muro e a corrente segue do outro lado até o inimigo', () => {
    const wall: WallSpec = { x: -3.9, z: 0, w: 0.35, d: 3, h: 0.7, style: 'hedge' };
    const L = layout(spec([soldier(-1.0, 0)], [wall]));
    const st = L.begin(-6.6, 0, 'common').stroke!;
    for (let i = 0; i < 4; i++) one(L, st, 'common');
    const j = one(L, st, 'jumper');
    const land = one(L, st, 'common');
    expect(Math.hypot(land.x - j.x, land.z - j.z)).toBeCloseTo(JUMP_DIST, 2);
    expect(land.x).toBeGreaterThan(wall.x);
    upTo(L, st, 12);
    expect(run(L).win).toBe(true);
  });

  it('Mola: uma Pesada com o selo salta igual (e a corrente segue)', () => {
    const wall: WallSpec = { x: -3.9, z: 0, w: 0.35, d: 3, h: 0.7, style: 'stone' };
    const L = layout(spec([soldier(-1.0, 0)], [wall]));
    const anyL = L as unknown as { entries: { card: { uid: number; type: string; seals: string[] }; kind: string; left: number }[]; recount(): void };
    anyL.entries.push({ card: { uid: -999, type: 'heavy', seals: ['spring'] }, kind: 'heavy+spring', left: 1 });
    anyL.recount();
    const st = L.begin(-6.6, 0, 'common').stroke!;
    for (let i = 0; i < 4; i++) one(L, st, 'common');
    one(L, st, 'heavy+spring');
    const land = one(L, st, 'common');
    expect(land.x).toBeGreaterThan(wall.x);
    upTo(L, st, 12);
    expect(run(L).win).toBe(true);
  });
});
