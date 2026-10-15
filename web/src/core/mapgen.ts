import { Rng, hash2 } from './rng';
import { isBossPhase, isShopPhase } from './rules';
import { Deck, deckTotal } from './pieces';

// Gerador de fases (puro). Tabuleiro 16 × 10 m centrado na origem; X → direita, Z → frente (tela).
// Gera em orientação canônica (gatilho à esquerda mirando +X) e espelha por sorteio.
export const BOARD = { w: 16, d: 10 };
export const BOARD_MARGIN = 0.3;

export type EnemyKind = 'soldier' | 'brute' | 'patroller' | 'general';
export interface Vec2 { x: number; z: number }
export interface EnemySpec {
  kind: EnemyKind;
  x: number; z: number; yaw: number;
  squad: number;
  patrol?: { pts: Vec2[]; speed: number };
}
export type WallStyle = 'stone' | 'hedge' | 'crate';
export interface WallSpec { x: number; z: number; w: number; d: number; h: number; style: WallStyle }
export interface LavaSpec { x: number; z: number; r: number }
export interface PhaseSpec {
  depth: number;
  seed: number;
  title: string;
  subtitle: string;
  trigger: { x: number; z: number; yaw: number };
  enemies: EnemySpec[];
  walls: WallSpec[];
  lava: LavaSpec[];
  par: number;
  boss: boolean;
  shop: boolean;
  hint?: string;
}

export const ENEMY_RADIUS: Record<EnemyKind, number> = { soldier: 0.19, brute: 0.3, patroller: 0.2, general: 0.4 };
export const ENEMY_HP: Record<EnemyKind, number> = { soldier: 1, patroller: 1, brute: 2, general: 4 };

const AREAS = ['Campo de Treino', 'Vila do Moinho', 'Ponte Velha', 'Pátio do Quartel', 'Mercado', 'Muralhas', 'Bosque Sombrio', 'Forja', 'Torre Norte', 'Cidadela'];

export function rectDist(px: number, pz: number, w: WallSpec): number {
  const dx = Math.max(Math.abs(px - w.x) - w.w / 2, 0);
  const dz = Math.max(Math.abs(pz - w.z) - w.d / 2, 0);
  return Math.hypot(dx, dz);
}

function segPointDist(ax: number, az: number, bx: number, bz: number, px: number, pz: number): number {
  const vx = bx - ax, vz = bz - az;
  const L2 = vx * vx + vz * vz || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / L2));
  return Math.hypot(ax + vx * t - px, az + vz * t - pz);
}

function inside(x: number, z: number, m: number): boolean {
  return Math.abs(x) <= BOARD.w / 2 - m && Math.abs(z) <= BOARD.d / 2 - m;
}

function squadCount(depth: number): number {
  if (depth <= 1) return 1;
  if (depth <= 4) return 2;
  if (depth <= 7) return 3;
  if (depth <= 11) return 4;
  return 5;
}

/** Estimativa de peças para visitar todos os pelotões (vizinho mais próximo, com folga de desvio). */
export function estimatePieces(trigger: Vec2, centers: Vec2[], walls: number): number {
  const left = centers.slice();
  let cur: Vec2 = trigger;
  let len = 0;
  let first = true;
  while (left.length) {
    let bi = 0, bd = Infinity;
    for (let i = 0; i < left.length; i++) {
      const d = Math.hypot(left[i].x - cur.x, left[i].z - cur.z);
      if (d < bd) { bd = d; bi = i; }
    }
    // a partir do 2º pelotão a corrente pode sair de um ramo (bifurcação) — conta 80%
    len += Math.max(0, bd - 0.45) * (first ? 1 : 0.8);
    first = false;
    cur = left.splice(bi, 1)[0];
  }
  const detour = 1.1 + 0.05 * Math.min(walls, 4);
  return Math.ceil((len * detour) / 0.38);
}

export function generatePhase(runSeed: number, depth: number, deck: Deck): PhaseSpec {
  const deckCards = deckTotal(deck);
  // nunca mais pelotões do que a mão consegue alcançar (1 bifurcação = 1 ramo extra)
  const squadCap = deck.fork + 1 + (depth >= 9 ? 1 : 0);
  const rng = new Rng(hash2(runSeed, depth * 7919 + 13));
  const boss = isBossPhase(depth) && depth >= 4;
  let best: PhaseSpec | null = null;
  for (let tries = 0; tries < 60 && !best; tries++) {
    best = tryGenerate(rng, runSeed, depth, deckCards, boss, tries, squadCap);
  }
  if (!best) best = fallback(runSeed, depth);
  // espelhamento (variedade sem mudar a dificuldade)
  if (depth >= 1 && rng.chance(0.5)) mirror(best, 'x');
  if (rng.chance(0.5)) mirror(best, 'z');
  return best;
}

function mirror(s: PhaseSpec, axis: 'x' | 'z') {
  const fx = axis === 'x' ? -1 : 1, fz = axis === 'z' ? -1 : 1;
  const yawM = (y: number) => (axis === 'x' ? -y : Math.PI - y);
  s.trigger = { x: s.trigger.x * fx, z: s.trigger.z * fz, yaw: yawM(s.trigger.yaw) };
  for (const e of s.enemies) {
    e.x *= fx; e.z *= fz; e.yaw = yawM(e.yaw);
    if (e.patrol) e.patrol.pts = e.patrol.pts.map((p) => ({ x: p.x * fx, z: p.z * fz }));
  }
  for (const w of s.walls) { w.x *= fx; w.z *= fz; }
  for (const l of s.lava) { l.x *= fx; l.z *= fz; }
}

function fallback(runSeed: number, depth: number): PhaseSpec {
  const enemies: EnemySpec[] = [-0.5, 0, 0.5].map((dz) => ({ kind: 'soldier', x: -0.5, z: dz, yaw: -Math.PI / 2, squad: 0 }));
  return {
    depth, seed: runSeed, title: `Fase ${depth + 1}`, subtitle: AREAS[depth % AREAS.length],
    trigger: { x: -5, z: 0, yaw: Math.PI / 2 }, enemies, walls: [], lava: [], par: 12, boss: false, shop: isShopPhase(depth),
  };
}

function formation(rng: Rng, n: number, cx: number, cz: number, faceYaw: number): Vec2[] {
  const sp = 0.55;
  const shape = n <= 2 ? rng.pick(['row', 'column']) : rng.pick(['row', 'column', 'triangle', 'cluster']);
  // eixos locais: f = (sin, cos) aponta para o gatilho; p perpendicular
  const fx = Math.sin(faceYaw), fz = Math.cos(faceYaw);
  const px = fz, pz = -fx;
  const pts: Vec2[] = [];
  const put = (a: number, b: number) => pts.push({ x: cx + px * a + fx * b, z: cz + pz * a + fz * b });
  if (shape === 'row') for (let i = 0; i < n; i++) put((i - (n - 1) / 2) * sp, 0);
  else if (shape === 'column') for (let i = 0; i < n; i++) put(0, -(i - (n - 1) / 2) * sp);
  else if (shape === 'triangle') {
    let placed = 0;
    for (let r = 0; placed < n; r++) for (let c = 0; c <= r && placed < n; c++, placed++) put((c - r / 2) * sp, -r * sp * 0.87);
  } else {
    const ring = [[0, 0], [sp, 0], [-sp, 0], [0, -sp], [sp * 0.5, sp * 0.87], [-sp * 0.5, -sp * 0.87]];
    for (let i = 0; i < n; i++) put(ring[i][0], ring[i][1]);
  }
  return pts;
}

function tryGenerate(rng: Rng, runSeed: number, depth: number, deckCards: number, boss: boolean, tries: number, squadCap: number): PhaseSpec | null {
  const trigger = { x: -6.6, z: depth === 0 ? 0 : rng.range(-2.6, 2.6), yaw: Math.PI / 2 };
  const enemies: EnemySpec[] = [];
  const walls: WallSpec[] = [];
  const lava: LavaSpec[] = [];
  const budget = Math.max(10, Math.floor(deckCards * (depth < 2 ? 0.85 : 0.8)));
  let nSquads = Math.min(squadCount(depth), squadCap);
  // relaxa a cada falha: menos pelotões, mais perto
  if (tries > 30) nSquads = Math.max(1, nSquads - 1);
  const shrink = 1 - Math.min(0.45, tries * 0.012);

  // --- pelotões ---
  const centers: Vec2[] = [];
  if (depth === 0) {
    centers.push({ x: trigger.x + 4.4, z: trigger.z });
  } else if (depth === 2) {
    // aula de bifurcação: dois pelotões em lados opostos
    const ax = trigger.x + 4.2 * shrink + 0.6;
    centers.push({ x: ax, z: trigger.z + 1.6 }, { x: ax, z: trigger.z - 1.6 });
  } else {
    for (let i = 0; i < nSquads; i++) {
      let ok = false;
      for (let k = 0; k < 40 && !ok; k++) {
        const maxX = -6.6 + (3 + 10.4 * shrink);
        const c = { x: rng.range(-3.4, Math.min(6.8, maxX)), z: rng.range(-3.8, 3.8) };
        if (Math.hypot(c.x - trigger.x, c.z - trigger.z) < 3.4) continue;
        if (centers.some((o) => Math.hypot(o.x - c.x, o.z - c.z) < 2.6)) continue;
        centers.push(c); ok = true;
      }
      if (!ok) return null;
    }
  }
  for (const c of centers) if (!inside(c.x, c.z, 1.0)) return null;

  // custo: cabe no baralho?
  const nWalls = depth === 0 ? 0 : Math.min(1 + Math.floor(depth / 2), 6);
  const est = estimatePieces(trigger, centers, nWalls);
  if (est > budget) return null;

  const maxSize = Math.min(5, 3 + Math.floor(depth / 4));
  centers.forEach((c, si) => {
    const n = depth === 0 ? 3 : rng.int(2, maxSize);
    const face = Math.atan2(trigger.x - c.x, trigger.z - c.z);
    const pts = formation(rng, n, c.x, c.z, face);
    pts.forEach((p) => enemies.push({ kind: 'soldier', x: p.x, z: p.z, yaw: face, squad: si }));
  });
  // brutamontes
  if (depth >= 3) {
    for (let si = 0; si < centers.length; si++) {
      const members = enemies.filter((e) => e.squad === si);
      if (rng.chance(Math.min(0.65, 0.2 + 0.06 * depth))) members[members.length - 1].kind = 'brute';
      if (depth >= 8 && members.length > 2 && rng.chance(0.35)) members[0].kind = 'brute';
    }
  }
  // chefe: General no pelotão mais distante
  if (boss) {
    let far = 0, fd = -1;
    centers.forEach((c, i) => { const d = Math.hypot(c.x - trigger.x, c.z - trigger.z); if (d > fd) { fd = d; far = i; } });
    const members = enemies.filter((e) => e.squad === far);
    const g = members[Math.floor(members.length / 2)];
    g.kind = 'general';
    // abre espaço ao redor do general
    for (const m of members) if (m !== g && Math.hypot(m.x - g.x, m.z - g.z) < 0.75) {
      const a = Math.atan2(m.x - g.x, m.z - g.z);
      m.x = g.x + Math.sin(a) * 0.75; m.z = g.z + Math.cos(a) * 0.75;
    }
  }
  for (const e of enemies) if (!inside(e.x, e.z, 0.6)) return null;

  // patrulheiros
  const nPatrol = depth < 4 ? 0 : depth >= 9 ? rng.int(1, 2) : rng.chance(0.6) ? 1 : 0;
  for (let i = 0; i < nPatrol; i++) {
    const c = rng.pick(centers);
    const w = rng.range(1.6, 2.6), d = rng.range(1.0, 1.6);
    const ox = c.x + rng.range(-1.2, 0.2), oz = c.z + (rng.chance(0.5) ? 1 : -1) * rng.range(0.9, 1.5);
    const pts = [
      { x: ox - w / 2, z: oz - d / 2 }, { x: ox + w / 2, z: oz - d / 2 },
      { x: ox + w / 2, z: oz + d / 2 }, { x: ox - w / 2, z: oz + d / 2 },
    ];
    if (pts.some((p) => !inside(p.x, p.z, 0.6))) continue;
    if (pts.some((p) => Math.hypot(p.x - trigger.x, p.z - trigger.z) < 2)) continue;
    const clash = enemies.some((e) => pts.some((p, k) => {
      const q = pts[(k + 1) % 4];
      return segPointDist(p.x, p.z, q.x, q.z, e.x, e.z) < 0.55;
    }));
    if (clash) continue;
    enemies.push({
      kind: 'patroller', x: pts[0].x, z: pts[0].z, yaw: Math.PI / 2, squad: 100 + i,
      patrol: { pts, speed: Math.min(0.95, 0.45 + 0.035 * depth) },
    });
  }

  // muros: "porteira" atravessada no caminho gatilho→pelotão + avulsos
  const wallOk = (w: WallSpec) => {
    if (!inside(w.x, w.z, 0.2) || Math.abs(w.x) + w.w / 2 > BOARD.w / 2 - 0.2 || Math.abs(w.z) + w.d / 2 > BOARD.d / 2 - 0.2) return false;
    if (rectDist(trigger.x, trigger.z, w) < 2.0) return false;
    for (const e of enemies) {
      if (e.patrol) { if (e.patrol.pts.some((p) => rectDist(p.x, p.z, w) < 0.5)) return false; continue; }
      if (rectDist(e.x, e.z, w) < ENEMY_RADIUS[e.kind] + 0.62) return false;
    }
    for (const o of walls) {
      const dx = Math.abs(o.x - w.x) - (o.w + w.w) / 2, dz = Math.abs(o.z - w.z) - (o.d + w.d) / 2;
      if (dx < 0.7 && dz < 0.7) return false;
    }
    return true;
  };
  const styles: WallSpec['style'][] = depth < 3 ? ['stone', 'hedge'] : ['stone', 'hedge', 'crate'];
  for (let i = 0; i < nWalls; i++) {
    let placed = false;
    for (let k = 0; k < 30 && !placed; k++) {
      const gate = i === 0 || rng.chance(0.55);
      let w: WallSpec;
      const len = rng.range(1.3, 2.5), th = rng.range(0.28, 0.38);
      const style = rng.pick(styles);
      const h = style === 'hedge' ? 0.7 : style === 'crate' ? 0.6 : 0.55;
      if (gate) {
        const c = rng.pick(centers);
        const t = rng.range(0.38, 0.66);
        const mx = trigger.x + (c.x - trigger.x) * t, mz = trigger.z + (c.z - trigger.z) * t;
        const vertical = Math.abs(c.x - trigger.x) > Math.abs(c.z - trigger.z);
        const off = rng.range(-0.5, 0.5);
        w = vertical ? { x: mx, z: mz + off, w: th, d: len, h, style } : { x: mx + off, z: mz, w: len, d: th, h, style };
      } else {
        const vertical = rng.chance(0.5);
        const x = rng.range(-5, 7), z = rng.range(-4, 4);
        w = vertical ? { x, z, w: th, d: len, h, style } : { x, z, w: len, d: th, h, style };
      }
      if (wallOk(w)) { walls.push(w); placed = true; }
    }
  }

  // lava (só Grande/Torre atravessam; contornar também vale)
  if (depth >= 4) {
    const nLava = Math.min(3, rng.int(0, 1 + Math.floor((depth - 4) / 3)) + (depth === 4 ? 1 : 0));
    for (let i = 0; i < nLava; i++) {
      for (let k = 0; k < 25; k++) {
        const c = rng.pick(centers);
        const t = rng.range(0.3, 0.7);
        const r = rng.range(0.3, 0.44);
        const L = { x: trigger.x + (c.x - trigger.x) * t + rng.range(-0.3, 0.3), z: trigger.z + (c.z - trigger.z) * t + rng.range(-0.3, 0.3), r };
        if (!inside(L.x, L.z, r + 0.4)) continue;
        if (Math.hypot(L.x - trigger.x, L.z - trigger.z) < r + 1.3) continue;
        if (enemies.some((e) => (e.patrol ? e.patrol.pts.some((p) => Math.hypot(p.x - L.x, p.z - L.z) < r + 0.5) : Math.hypot(e.x - L.x, e.z - L.z) < r + 0.8))) continue;
        if (walls.some((w) => rectDist(L.x, L.z, w) < r + 0.6)) continue;
        if (lava.some((o) => Math.hypot(o.x - L.x, o.z - L.z) < o.r + r + 0.8)) continue;
        lava.push(L); break;
      }
    }
  }

  const par = Math.max(6, est + (enemies.some((e) => e.kind !== 'soldier') ? 2 : 0));
  const area = AREAS[Math.floor(depth / 3) % AREAS.length];
  let hint: string | undefined;
  if (depth === 0) hint = 'Arraste a partir do marcador VERDE para desenhar a fileira até os soldados.';
  else if (depth === 1) hint = 'Muro no caminho! Faça a curva desenhando em volta dele.';
  else if (depth === 2) hint = 'Dois pelotões: use a BIFURCAÇÃO para dividir a corrente.';
  else if (enemies.some((e) => e.kind === 'brute') && depth <= 4) hint = 'Brutamontes aguentam 2 golpes. Pesada ou Torre derrubam de uma vez!';
  else if (lava.length && depth <= 6) hint = 'Lava! Coloque uma Grande ou Torre logo antes do poço para pular.';
  else if (boss) hint = 'O GENERAL aguenta 4 golpes. Explosivas e Pesadas ajudam muito!';

  return {
    depth, seed: runSeed,
    title: boss ? 'Fortaleza do General' : `Fase ${depth + 1}`,
    subtitle: area,
    trigger, enemies, walls, lava, par, boss, shop: isShopPhase(depth), hint,
  };
}
