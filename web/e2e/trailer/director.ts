// "Diretor" da corrente herói: monta a corrente com as MESMAS regras de colocação do jogador
// (Layout.begin/extend), traço a traço, a partir de um roteiro de pontos. Roda no node (verificação
// com a física headless) e na página (import '/e2e/trailer/director.ts') para a gravação.
import type { PhaseSpec, EnemySpec, EnemyKind } from '../../src/core/mapgen';
import { Layout, Placed } from '../../src/core/layout';
import { emptyDeck, PieceId } from '../../src/core/pieces';
import { launchOf } from '../../src/core/motion';

type P = [number, number];
export interface Cmd { name?: string; from: 'trigger' | string | [string, number]; kind: PieceId; to: P[] }

export function heroSpec(): PhaseSpec {
  const trigger = { x: -6.9, z: 0, yaw: Math.PI / 2 };
  const enemies: EnemySpec[] = [];
  let si = 0;
  const add = (kind: EnemyKind, x: number, z: number, face: number) => enemies.push({ kind, x, z, yaw: face, squad: si });
  const row = (kinds: EnemyKind[], cx: number, cz: number, face: number, sp = 0.56) => {
    // fileira perpendicular a quem olha (face = para onde o pelotão olha)
    const px = Math.cos(face), pz = -Math.sin(face);
    kinds.forEach((k, i) => { const o = (i - (kinds.length - 1) / 2) * sp; add(k, cx + px * o, cz + pz * o, face); });
    si++;
  };
  const col = (kinds: EnemyKind[], cx: number, cz: number, face: number, sp = 0.62) => {
    const fx = Math.sin(face), fz = Math.cos(face);
    kinds.forEach((k, i) => add(k, cx - fx * i * sp, cz - fz * i * sp, face));
    si++;
  };
  const W = -Math.PI / 2; // olhando para o gatilho (−x)
  row(['soldier', 'soldier', 'soldier'], -0.6, -3.5, W + 0.5);          // A: em cima
  row(['soldier', 'brute', 'soldier'], -0.6, 3.75, Math.PI);            // B: embaixo (brutamontes)
  col(['soldier', 'soldier', 'soldier', 'soldier'], 3.0, 4.0, W, 0.7);  // C: fila do Foguete
  row(['soldier', 'soldier', 'soldier'], 3.6, -3.2, W + 0.4);           // D
  // E: chefe — General no meio, guarda em volta
  add('general', 6.1, 0.0, W);
  add('brute', 6.0, -0.9, W); add('brute', 6.0, 0.9, W);
  add('soldier', 6.9, -0.45, W); add('soldier', 6.9, 0.45, W);
  si++;
  const walls = [
    { x: 0.7, z: 0.0, w: 0.4, d: 1.9, h: 0.75, style: 'stone' as const },
    { x: 3.2, z: 1.8, w: 1.5, d: 0.35, h: 0.6, style: 'hedge' as const },
    { x: -3.8, z: -2.6, w: 1.4, d: 0.35, h: 0.6, style: 'crate' as const },
  ];
  return { depth: 14, seed: 4242, title: 'Fase 15', subtitle: 'Cidadela', trigger, enemies, walls, gates: [], par: 140, boss: true };
}

export const HERO_CMDS: Cmd[] = [
  { name: 'trunk', from: 'trigger', kind: 'common', to: [[-5.0, 0]] },
  { name: 'tw', from: 'trunk', kind: 'tower', to: [[-2.5, 0]] },
  { name: 'tw2', from: 'tw', kind: 'common', to: [[-2.9, 0]] },
  { name: 'tri', from: 'tw2', kind: 'trifork', to: [[0, 0]] },
  // ramo de cima → pelotão A
  { name: 'up', from: ['tri', 0], kind: 'common', to: [[-2.0, -1.2], [-1.6, -2.4], [-1.0, -3.1]] },
  // ramo do meio → Saltadora pula o muro → bifurca para D e para o chefe
  { name: 'mid', from: ['tri', 1], kind: 'common', to: [[-0.4, 0]] },
  { name: 'jump', from: 'mid', kind: 'jumper', to: [[3, 0]] },
  { name: 'mid2', from: 'jump', kind: 'common', to: [[2.3, 0]] },
  { name: 'fk', from: 'mid2', kind: 'fork', to: [[5, 0]] },
  { name: 'toD', from: ['fk', 0], kind: 'common', to: [[3.0, -1.0], [3.3, -2.5]] },
  { name: 'toE', from: ['fk', 1], kind: 'common', to: [[4.2, 0.2], [5.0, 0.0]] },
  { name: 'bum', from: 'toE', kind: 'blast', to: [[6.1, 0]] },
  // ramo de baixo → bifurca: Pesada no brutamontes (B) e Foguete na fila C
  { name: 'dn', from: ['tri', 2], kind: 'common', to: [[-2.0, 1.2], [-1.7, 1.9]] },
  { name: 'fk2', from: 'dn', kind: 'fork', to: [[-1.4, 2.6]] },
  { name: 'toB', from: ['fk2', 1], kind: 'common', to: [[-1.2, 2.8], [-0.7, 3.0]] },
  { name: 'hv', from: 'toB', kind: 'heavy', to: [[-0.6, 3.75]] },
  { name: 'toC', from: ['fk2', 0], kind: 'common', to: [[-0.6, 2.1], [0.4, 2.4], [1.1, 3.2], [1.6, 3.85], [2.0, 4.0]] },
  { name: 'rk', from: 'toC', kind: 'runner', to: [[4, 4.0]] },
];

export function heroDeck() {
  return Object.assign(emptyDeck(), { common: 300, tower: 6, trifork: 3, fork: 6, jumper: 3, runner: 3, blast: 4, heavy: 6 });
}

/** Executa o roteiro; devolve o layout (peças na ordem em que foram postas) e as falhas. */
export function direct(spec: PhaseSpec, cmds: Cmd[] = HERO_CMDS, deck = heroDeck()) {
  const L = new Layout(spec, deck);
  const refs = new Map<string, Placed[]>();
  const fails: string[] = [];
  for (const c of cmds) {
    let head: Placed | undefined;
    if (c.from !== 'trigger') {
      const [ref, idx] = Array.isArray(c.from) ? c.from : [c.from, -1];
      const list = refs.get(ref);
      if (!list || !list.length) { fails.push(`${c.name}: sem ${ref}`); continue; }
      head = idx < 0 ? list[list.length - 1] : list[idx];
    }
    const start = head ? { x: head.x, z: head.z } : { x: spec.trigger.x, z: spec.trigger.z };
    const b = L.begin(start.x, start.z, c.kind, { x: c.to[0][0], z: c.to[0][1] });
    if (b.fail) { fails.push(`${c.name}: begin ${b.fail}`); continue; }
    const st = b.stroke!;
    if (head) st.head = head.id; // garante a ponta certa (meias-peças vizinhas)
    const placed: Placed[] = [...(b.placed ?? [])];
    // peça especial = UMA carta: o cursor fica logo depois do alcance da ponta
    if (c.kind !== 'common' && !(b.placed?.length)) {
      const h = L.get(st.head)!;
      const o = launchOf(h, spec);
      const a = Math.atan2(c.to[0][0] - o.x, c.to[0][1] - o.z);
      const r = L.extend(st, o.x + Math.sin(a) * (o.step + 0.05), o.z + Math.cos(a) * (o.step + 0.05), c.kind);
      placed.push(...r.placed);
      if (r.fail || !r.placed.length) fails.push(`${c.name}: ${r.fail ?? 'nada'}`);
      refs.set(c.name ?? String(refs.size), placed);
      continue;
    }
    for (const [x, z] of c.to) {
      if (st.done) break;
      const r = L.extend(st, x, z, c.kind);
      placed.push(...r.placed);
      if (r.fail) { fails.push(`${c.name}: ${r.fail} @${x},${z}`); break; }
    }
    refs.set(c.name ?? String(refs.size), placed);
  }
  return { layout: L, fails };
}
