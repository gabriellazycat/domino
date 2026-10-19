import { describe, it, expect, beforeAll } from 'vitest';
import RAPIER from '@dimforge/rapier3d-compat';
import { Sim } from '../src/game/sim';
import type { PhaseSpec } from '../src/core/mapgen';
import { Layout, Placed } from '../src/core/layout';
import { emptyDeck, PieceId, CURSED } from '../src/core/pieces';
import { canSeal } from '../src/core/cards';
import { rollEvent, curseOffers, curseChance, EventKind } from '../src/core/events';
import { Rng } from '../src/core/rng';
import { launchOf, CROOK_DIST } from '../src/core/motion';

// Peças malditas (evento "Presente do Dono") e o próprio evento.
const spec = (): PhaseSpec => ({ enemies: [], walls: [], trigger: { x: 0, z: -3, yaw: 0 } } as unknown as PhaseSpec);
/** corrente reta em +z a partir de z=-2 */
const chain = (types: PieceId[]): Placed[] =>
  types.map((type, i) => ({ id: i + 1, type, x: 0, z: -2 + i * 0.38, yaw: 0, parent: i ? i : -1, stroke: 1 } as Placed));

function run(types: PieceId[], secs = 5): Sim {
  const sim = new Sim(spec(), chain(types), 0, {});
  sim.fire();
  for (let i = 0; i < 120 * secs && !sim.done; i++) sim.step();
  return sim;
}

describe('peças malditas', () => {
  beforeAll(async () => { await RAPIER.init(); });

  it('Teimosa não cai com Comum, mas cai com Pesada', () => {
    const a = run(['common', 'common', 'metal', 'common']);
    expect(a.pieces[1].kicked).toBe(true); // encostou nela e ficou escorada
    expect(a.pieces[2].fallen).toBe(false);
    expect(a.pieces[3].fallen).toBe(false);
    const b = run(['common', 'heavy', 'metal', 'common']);
    expect(b.pieces[2].fallen).toBe(true);
    expect(b.pieces[3].fallen).toBe(true);
  });

  it('Ciumenta tira o poder das vizinhas', () => {
    const sim = new Sim(spec(), chain(['common', 'heavy', 'jealous', 'blast', 'common']), 0, {});
    expect(sim.pieces.map((s) => !!s.muted)).toEqual([false, true, false, true, false]);
    expect(sim.typeOf(sim.pieces[3])).toBe('common');
  });

  it('Capanga conta como inimigo e cai para trás (a onda morre nela)', () => {
    const sim = new Sim(spec(), chain(['common', 'common', 'minion', 'common']), 0, {});
    expect(sim.alive).toBe(1);
    sim.fire();
    for (let i = 0; i < 120 * 5 && !sim.done; i++) sim.step();
    expect(sim.pieces[2].fallen).toBe(true);
    expect(sim.pieces[3].fallen).toBe(false);
    expect(sim.alive).toBe(0);
  });

  it('Torta fica em pé como peça comum (não gira) e guarda o lado do pulo', () => {
    const d = emptyDeck();
    d.crooked = 1;
    const L = new Layout(spec(), d);
    const r = L.begin(0, -3, 'crooked');
    expect(r.placed?.[0].type).toBe('crooked');
    expect(Math.abs(r.placed![0].yaw)).toBeLessThan(1e-6); // de frente para a corrente
    expect([1, -1]).toContain(r.placed![0].side);
  });

  it('a Torta derruba a corrente 90° para o lado: a peça seguinte nasce onde ela pousa e o soldado cai', () => {
    // corrente em +x; depois da Torta ela segue para o lado do pulo (±z) até um soldado
    const mkSpec = () => ({ depth: 3, seed: 1, title: 't', subtitle: '', trigger: { x: -6.6, z: 0, yaw: Math.PI / 2 }, enemies: [], walls: [], par: 30, boss: false } as unknown as PhaseSpec);
    const sides = new Set<number>();
    for (const n of [3, 4]) { // paridade diferente dos ids: a Torta escolhe lados diferentes
      const sp = mkSpec();
      const d = emptyDeck(); d.common = 40; d.crooked = 1;
      const L = new Layout(sp, d);
      const st = L.begin(-6.6, 0, 'common').stroke!;
      for (let i = 0; i < n; i++) {
        const h = L.get(st.head)!;
        L.extend(st, h.x + 0.4, h.z, 'common');
      }
      const h0 = L.get(st.head)!;
      const cr = L.extend(st, h0.x + 0.4, h0.z, 'crooked').placed[0];
      expect(cr.type).toBe('crooked');
      expect(Math.abs(cr.yaw - Math.PI / 2)).toBeLessThan(1e-6); // em pé, de frente para a corrente
      sides.add(cr.side!);
      const dz = Math.cos(cr.yaw + cr.side! * Math.PI / 2); // direção do pulo no eixo z
      // as peças depois da Torta saem para o lado do pulo
      for (let i = 0; i < 6; i++) {
        const h = L.get(st.head)!;
        const o = launchOf(h, L.spec);
        const r = L.extend(st, o.x + Math.sin(o.yaw) * o.step * 1.02, o.z + Math.cos(o.yaw) * o.step * 1.02, 'common');
        if (i === 0) {
          expect(r.placed[0], `peça depois da Torta: ${r.fail}`).toBeTruthy();
          expect(Math.abs(r.placed[0].z - cr.z)).toBeCloseTo(CROOK_DIST, 2);
          expect(Math.sign(r.placed[0].z - cr.z)).toBe(Math.sign(dz));
          expect(Math.abs(r.placed[0].x - cr.x)).toBeLessThan(0.05);
          const an = L.anchorOf(cr); // o anel da Torta fica onde a próxima peça nasce
          expect(Math.hypot(r.placed[0].x - an.x, r.placed[0].z - an.z)).toBeLessThan(0.06);
        }
      }
      const last = L.get(st.head)!;
      sp.enemies.push({ kind: 'soldier', x: last.x, z: last.z + Math.sign(dz) * 0.55, yaw: 0, squad: 0 });
      const sim = new Sim(sp, L.pieces, 0, {});
      sim.runHeadless();
      expect(sim.win, `Torta (lado ${cr.side}, ${n} comuns antes)`).toBe(true);
      sim.dispose();
    }
    expect(sides.size).toBe(2);
  });

  it('maldita na mão trava a Nova mão; não aceita selo', () => {
    const d = emptyDeck();
    d.common = 2; d.wander = 1;
    const L = new Layout(spec(), d);
    expect(L.cursedInHand()).toBe(true);
    for (const t of CURSED) expect(canSeal({ uid: 1, type: t, seals: [] }, 'guard')).toBe(false);
  });
});

describe('Presente do Dono', () => {
  it('a chance dele sobe quando não sai (mesmo com eventos bons) e só ele mesmo zera', () => {
    expect(curseChance(0)).toBeCloseTo(0.12);
    expect(curseChance(20)).toBe(1);
    const st = { since: 0, last: null as EventKind | null, curseSince: 0 };
    const rng = new Rng(11);
    let prev = 0;
    for (let d = 1; d < 300; d++) {
      const k = rollEvent(st, d, rng, true);
      if (k === 'curse') { expect(st.curseSince).toBe(0); prev = 0; continue; }
      if (d >= 2) { expect(st.curseSince).toBe(prev + 1); prev = st.curseSince!; }
    }
  });

  it('só aparece a partir da 3ª fase e oferece 2 malditas diferentes', () => {
    const seen = new Map<number, Set<EventKind>>();
    const rng = new Rng(7);
    for (let i = 0; i < 4000; i++) {
      const depth = i % 6;
      const k = rollEvent({ since: 5, last: null }, depth, rng, true);
      if (!k) continue;
      if (!seen.has(depth)) seen.set(depth, new Set());
      seen.get(depth)!.add(k);
    }
    expect(seen.get(1)?.has('curse')).toBe(false);
    expect(seen.get(4)?.has('curse')).toBe(true);
    const offers = curseOffers(new Rng(3));
    expect(offers.length).toBe(2);
    expect(offers[0]).not.toBe(offers[1]);
    expect(offers.every((t) => CURSED.includes(t))).toBe(true);
  });
});

describe('Trifurcação', () => {
  beforeAll(async () => { await RAPIER.init(); });

  it('uma carta vira 3 meias-peças, sai inteira ao desfazer e a onda derruba as três', () => {
    const d = emptyDeck();
    d.common = 2; d.trifork = 1;
    const L = new Layout(spec(), d);
    L.begin(0, -3, 'common');
    const st = { head: L.heads()[0].id, done: false, id: 1 };
    const r = L.extend(st, 0, -2.2, 'trifork');
    expect(r.placed.length).toBe(3);
    expect(st.done).toBe(true);
    expect(new Set(r.placed.map((p) => p.parent)).size).toBe(1);
    expect(r.placed[0].group).toEqual(r.placed.map((p) => p.id));
    expect(L.removeHead(r.placed[1].id).length).toBe(3);
    expect(L.uses('trifork')).toBe(1);

    const sim = new Sim(spec(), [
      { id: 1, type: 'common', x: 0, z: -2, yaw: 0, parent: -1, stroke: 1 },
      ...[-0.2, 0, 0.2].map((x, i) => ({ id: 2 + i, type: 'trifork', x, z: -1.62, yaw: 0, parent: 1, stroke: 1 })),
    ] as Placed[], 0, {});
    sim.fire();
    for (let i = 0; i < 120 * 4 && !sim.done; i++) sim.step();
    expect(sim.pieces.slice(1).every((s) => s.fallen)).toBe(true);
  });
});
