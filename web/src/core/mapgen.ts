import { Rng, hash2 } from './rng';
import { isBossPhase } from './rules';
import { Deck, PIECES, PIECE_ORDER } from './pieces';

// Gerador de fases (puro). Tabuleiro 16 × 10 m centrado na origem; X → direita, Z → frente (tela).
// Gera em orientação canônica (gatilho à esquerda mirando +X) e espelha por sorteio.
export const BOARD = { w: 16, d: 10 };
export const BOARD_MARGIN = 0.3;

export type EnemyKind = 'soldier' | 'brute' | 'patroller' | 'torcher' | 'general' | 'ogre' | 'archer';
export interface Vec2 { x: number; z: number }
export interface EnemySpec {
  kind: EnemyKind;
  x: number; z: number; yaw: number;
  squad: number;
  patrol?: { pts: Vec2[]; speed: number };
}
export type WallStyle = 'stone' | 'hedge' | 'crate';
/**
 * Um retângulo de muro: `w` no eixo X local, `d` no Z local, girado por `yaw` (igual a rotation.y do three).
 * Muros em L e curvos são vários retângulos com o mesmo `group`.
 */
export interface WallSpec { x: number; z: number; w: number; d: number; h: number; style: WallStyle; yaw?: number; group?: number }
/** Retângulo girado no chão (muro, porteira): `w` no X local, `d` no Z local. */
export interface Rect { x: number; z: number; w: number; d: number; yaw?: number }
/**
 * Porteira com alavanca: grade de ferro num vão de muro. Uma peça derrubando a ALAVANCA faz a grade
 * afundar no chão por `open` segundos; depois ela sobe de novo.
 */
export interface GateSpec extends Rect { h: number; lever: Vec2; open: number }
export interface PhaseSpec {
  depth: number;
  seed: number;
  title: string;
  subtitle: string;
  trigger: { x: number; z: number; yaw: number };
  enemies: EnemySpec[];
  walls: WallSpec[];
  /** porteiras (opcional: fases antigas/testes não têm) */
  gates?: GateSpec[];
  par: number;
  boss: boolean;
  hint?: string;
}

export const ENEMY_RADIUS: Record<EnemyKind, number> = { soldier: 0.19, brute: 0.3, patroller: 0.2, torcher: 0.2, general: 0.4, ogre: 0.34, archer: 0.2 };
export const ENEMY_HP: Record<EnemyKind, number> = { soldier: 1, patroller: 1, torcher: 1, brute: 2, general: 4, ogre: 3, archer: 1 };
/** Raio do círculo do Arqueiro: a 1ª peça da corrente que se mexer aqui dentro leva a flecha de fogo. */
export const ARCHER_RANGE = 2.3;

const AREAS = ['Campo de Treino', 'Vila do Moinho', 'Ponte Velha', 'Pátio do Quartel', 'Mercado', 'Muralhas', 'Bosque Sombrio', 'Forja', 'Torre Norte', 'Cidadela'];

/** Distância de um ponto ao retângulo do muro (0 dentro), levando em conta o giro. */
export function rectDist(px: number, pz: number, w: Rect): number {
  let lx = px - w.x, lz = pz - w.z;
  if (w.yaw) {
    // mundo → local (inverso de rotation.y)
    const c = Math.cos(w.yaw), s = Math.sin(w.yaw);
    [lx, lz] = [lx * c - lz * s, lx * s + lz * c];
  }
  const dx = Math.max(Math.abs(lx) - w.w / 2, 0);
  const dz = Math.max(Math.abs(lz) - w.d / 2, 0);
  return Math.hypot(dx, dz);
}

/** Meia-largura/meia-profundidade da caixa alinhada aos eixos que contém o muro girado. */
export function wallExtents(w: Rect): { ex: number; ez: number } {
  const c = Math.abs(Math.cos(w.yaw ?? 0)), s = Math.abs(Math.sin(w.yaw ?? 0));
  return { ex: c * w.w / 2 + s * w.d / 2, ez: s * w.w / 2 + c * w.d / 2 };
}

/** Pontos ao longo da linha central do muro (para checar se dois muros encostam). */
function wallSamples(w: WallSpec): Vec2[] {
  const c = Math.cos(w.yaw ?? 0), s = Math.sin(w.yaw ?? 0);
  const along = w.w >= w.d;
  const L = along ? w.w : w.d;
  const out: Vec2[] = [];
  for (let i = 0; i <= 4; i++) {
    const t = (i / 4 - 0.5) * L;
    const lx = along ? t : 0, lz = along ? 0 : t;
    out.push({ x: w.x + lx * c + lz * s, z: w.z - lx * s + lz * c });
  }
  return out;
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

/** Comprimento estimado da corrente que visita todos os pelotões (vizinho mais próximo, com folga de desvio). */
export function routeLength(trigger: Vec2, centers: Vec2[], walls: number): number {
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
  return len * detour;
}

/** Peças para cobrir a rota só com Comuns (passo 0,38): é o teto que o baralho precisa aguentar. */
export function estimatePieces(trigger: Vec2, centers: Vec2[], walls: number): number {
  return Math.ceil(routeLength(trigger, centers, walls) / 0.38);
}

/**
 * Alcance médio por peça usado no PAR: um deck que mistura Torres (1,15 m) com Comuns cobre a rota
 * com menos peças. Só de Comuns (0,38) passa do par; com algumas Torres fica dentro.
 */
export const PAR_REACH = 0.52;

/** Quantos metros de corrente o baralho cobre (cada peça vale o alcance da queda dela). */
export function deckReach(deck: Deck): number {
  let m = 0;
  for (const t of PIECE_ORDER) m += deck[t] * PIECES[t].step;
  return m;
}

export function generatePhase(runSeed: number, depth: number, deck: Deck): PhaseSpec {
  const reach = deckReach(deck);
  // nunca mais pelotões do que a mão consegue alcançar (1 bifurcação = 1 ramo extra)
  const squadCap = deck.fork + 1 + (depth >= 9 ? 1 : 0);
  const rng = new Rng(hash2(runSeed, depth * 7919 + 13));
  const boss = isBossPhase(depth) && depth >= 4;
  let best: PhaseSpec | null = null;
  for (let tries = 0; tries < 60 && !best; tries++) {
    best = tryGenerate(rng, runSeed, depth, reach, boss, tries, squadCap, deck);
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
  // espelhar inverte o sentido do giro
  for (const w of s.walls) { w.x *= fx; w.z *= fz; if (w.yaw) w.yaw = -w.yaw; }
  for (const g of s.gates ?? []) { g.x *= fx; g.z *= fz; if (g.yaw) g.yaw = -g.yaw; g.lever = { x: g.lever.x * fx, z: g.lever.z * fz }; }
}

/** Distância de um ponto à rota (fechada) de uma patrulha. */
function patrolDist(pts: Vec2[], x: number, z: number): number {
  let d = Infinity;
  for (let j = 0; j < pts.length; j++) {
    const p = pts[j], q = pts[(j + 1) % pts.length];
    d = Math.min(d, segPointDist(p.x, p.z, q.x, q.z, x, z));
  }
  return d;
}

/** Quanto o pelotão ocupa a partir do centro (até a borda do inimigo mais longe). */
function squadExtent(c: Vec2, members: EnemySpec[]): number {
  return Math.max(0.3, ...members.map((e) => Math.hypot(e.x - c.x, e.z - c.z) + ENEMY_RADIUS[e.kind]));
}

type PatrolShape = 'rect' | 'line' | 'circle' | 'guard' | 'eight';

/**
 * Rota de patrulha em volta/perto do pelotão `c`. Retângulo; LINHA atravessada no caminho (vai e volta);
 * CÍRCULO ao lado; RONDA em volta do próprio pelotão (é preciso cruzar a rota para chegar nele); OITO.
 */
function patrolShape(rng: Rng, shape: PatrolShape, c: Vec2, trigger: Vec2, members: EnemySpec[]): Vec2[] {
  const toT = Math.atan2(trigger.x - c.x, trigger.z - c.z);
  const ring = (cx: number, cz: number, R: number, n: number) =>
    Array.from({ length: n }, (_, k) => { const a = (k / n) * Math.PI * 2; return { x: cx + Math.cos(a) * R, z: cz + Math.sin(a) * R }; });
  if (shape === 'rect') {
    const w = rng.range(2.0, 3.6), d = rng.range(1.2, 2.2);
    const ox = c.x + rng.range(-1.4, 0.2), oz = c.z + (rng.chance(0.5) ? 1 : -1) * rng.range(1.0, 1.8);
    return [{ x: ox - w / 2, z: oz - d / 2 }, { x: ox + w / 2, z: oz - d / 2 }, { x: ox + w / 2, z: oz + d / 2 }, { x: ox - w / 2, z: oz + d / 2 }];
  }
  if (shape === 'line') {
    // atravessada no caminho gatilho→pelotão: um portão vivo que abre e fecha
    const t = rng.range(1.6, 2.6);
    const mx = c.x + Math.sin(toT) * t, mz = c.z + Math.cos(toT) * t;
    const L = rng.range(2.6, 4.2);
    const px = Math.cos(toT), pz = -Math.sin(toT);
    return [{ x: mx - px * L / 2, z: mz - pz * L / 2 }, { x: mx + px * L / 2, z: mz + pz * L / 2 }];
  }
  if (shape === 'guard') return ring(c.x, c.z, squadExtent(c, members) + 0.75, 16);
  if (shape === 'circle') {
    const R = rng.range(0.9, 1.5), a = rng.range(0, Math.PI * 2), d = R + rng.range(1.1, 1.7);
    return ring(c.x + Math.sin(a) * d, c.z + Math.cos(a) * d, R, 14);
  }
  // oito (lemniscata) entre o gatilho e o pelotão
  const A = rng.range(1.3, 1.9), rot = rng.range(0, Math.PI), off = rng.range(1.8, 2.6);
  const cx = c.x + Math.sin(toT) * off, cz = c.z + Math.cos(toT) * off;
  const cr = Math.cos(rot), sr = Math.sin(rot);
  return Array.from({ length: 24 }, (_, k) => {
    const t = (k / 24) * Math.PI * 2;
    const lx = A * Math.sin(t), lz = A * Math.sin(t) * Math.cos(t);
    return { x: cx + lx * cr - lz * sr, z: cz + lx * sr + lz * cr };
  });
}

function fallback(runSeed: number, depth: number): PhaseSpec {
  const enemies: EnemySpec[] = [-0.5, 0, 0.5].map((dz) => ({ kind: 'soldier', x: -0.5, z: dz, yaw: -Math.PI / 2, squad: 0 }));
  return {
    depth, seed: runSeed, title: `Fase ${depth + 1}`, subtitle: AREAS[depth % AREAS.length],
    trigger: { x: -5, z: 0, yaw: Math.PI / 2 }, enemies, walls: [], par: 12, boss: false,
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

function tryGenerate(rng: Rng, runSeed: number, depth: number, reach: number, boss: boolean, tries: number, squadCap: number, deck: Deck): PhaseSpec | null {
  const trigger = { x: -6.6, z: depth === 0 ? 0 : rng.range(-2.6, 2.6), yaw: Math.PI / 2 };
  const enemies: EnemySpec[] = [];
  const walls: WallSpec[] = [];
  // orçamento em METROS: o alcance do baralho (Torres valem 3 Comuns), com folga
  const budget = Math.max(10 * 0.38, reach * (depth < 2 ? 0.85 : 0.8));
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
  if (routeLength(trigger, centers, nWalls) > budget) return null;

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

  // patrulheiros: a partir da fase 4 (~70% das fases), 1–2 da fase 10 em diante; várias tentativas de encaixar a rota
  // (a fase 3 é o tutorial da bifurcação: sem patrulheiro). Rotas: retângulo e linha desde o começo; círculo e
  // RONDA em volta do pelotão da fase 6; oito da fase 8. Da fase 7 em diante, às vezes quem patrulha é o OGRO.
  const nPatrol = depth < 3 ? 0 : depth >= 9 ? rng.int(1, 2) : rng.chance(0.7) ? 1 : 0;
  for (let i = 0; i < nPatrol; i++) {
    for (let k = 0; k < 16; k++) {
      const si = rng.int(0, centers.length - 1);
      const c = centers[si];
      const shapes: PatrolShape[] = ['rect', 'line'];
      if (depth >= 5) shapes.push('circle', 'guard');
      if (depth >= 7) shapes.push('eight');
      const pts = patrolShape(rng, rng.pick(shapes), c, trigger, enemies.filter((e) => e.squad === si));
      if (pts.some((p) => !inside(p.x, p.z, 0.6))) continue;
      if (pts.some((p) => Math.hypot(p.x - trigger.x, p.z - trigger.z) < 2)) continue;
      if (enemies.some((e) => patrolDist(pts, e.x, e.z) < 0.36 + ENEMY_RADIUS[e.kind])) continue;
      // da fase 6 em diante, cerca de metade dos patrulheiros carrega uma TOCHA (queima peça em pé no caminho).
      // Sorteio derivado da rota (não consome o rng, para não mexer no resto da fase).
      const ogre = depth >= 6 && rng.chance(0.4);
      const torch = !ogre && depth >= 5 && ((Math.floor(Math.abs(pts[0].x * 97 + pts[0].z * 61)) + i) % 2 === 0);
      enemies.push({
        kind: ogre ? 'ogre' : torch ? 'torcher' : 'patroller', x: pts[0].x, z: pts[0].z, yaw: Math.PI / 2, squad: 100 + i,
        patrol: { pts, speed: ogre ? 0.3 : Math.min(0.95, 0.45 + 0.035 * depth) },
      });
      break;
    }
  }

  // arqueiro (fase 6+, ~40%): vigia um pelotão de perto, do lado do gatilho. A 1ª peça da corrente que se mexer
  // no círculo dele leva a flecha (uma só): uma Bifurcação dá a isca, o Foguete passa imune.
  if (depth >= 5 && rng.chance(0.4)) {
    for (let k = 0; k < 14; k++) {
      const c = rng.pick(centers);
      const a = Math.atan2(trigger.x - c.x, trigger.z - c.z) + rng.range(-1.0, 1.0);
      const d = rng.range(1.1, 1.6);
      const p = { x: c.x + Math.sin(a) * d, z: c.z + Math.cos(a) * d };
      if (!inside(p.x, p.z, 0.8)) continue;
      if (Math.hypot(p.x - trigger.x, p.z - trigger.z) < ARCHER_RANGE + 1.2) continue;
      if (enemies.some((e) => (e.patrol ? patrolDist(e.patrol.pts, p.x, p.z) < 0.6 : Math.hypot(e.x - p.x, e.z - p.z) < 0.75))) continue;
      enemies.push({ kind: 'archer', x: p.x, z: p.z, yaw: Math.atan2(trigger.x - p.x, trigger.z - p.z), squad: 200 });
      break;
    }
  }

  // muros: "porteira" atravessada no caminho gatilho→pelotão + avulsos. Formatos: reto, em L (fase 2+)
  // e curvo (fase 3+). L e curva são vários retângulos do mesmo grupo.
  const gates: GateSpec[] = [];
  const segOk = (w: WallSpec, sameGroup = false) => {
    const { ex, ez } = wallExtents(w);
    if (!inside(w.x, w.z, 0.2) || Math.abs(w.x) + ex > BOARD.w / 2 - 0.2 || Math.abs(w.z) + ez > BOARD.d / 2 - 0.2) return false;
    if (rectDist(trigger.x, trigger.z, w) < 2.0) return false;
    for (const e of enemies) {
      if (e.patrol) { if (e.patrol.pts.some((p) => rectDist(p.x, p.z, w) < 0.5) || wallSamples(w).some((p) => patrolDist(e.patrol!.pts, p.x, p.z) < 0.45)) return false; continue; }
      if (rectDist(e.x, e.z, w) < ENEMY_RADIUS[e.kind] + 0.62) return false;
    }
    for (const g of gates) if (rectDist(g.lever.x, g.lever.z, w) < 0.9) return false;
    if (sameGroup) return true;
    // não encosta em outro muro (deixa passagem de ~0,7 m)
    const mine = wallSamples(w);
    for (const o of [...walls, ...gates]) if (mine.some((p) => rectDist(p.x, p.z, o) < 0.7 + Math.min(w.w, w.d) / 2)) return false;
    return true;
  };

  // fortificações (fase 5+): anel de muro em volta de um pelotão. ABERTO (contorna até a entrada, que fica de
  // lado), FECHADO (caixotes: só a Saltadora entra — só se o baralho tem Saltadora) ou com PORTEIRA (fase 7+):
  // a grade só abre por alguns segundos quando a corrente derruba a alavanca, do lado de fora.
  let groupId = 0;
  if (depth >= 4) {
    let closedLeft = deck.jumper;
    for (let si = 0; si < centers.length; si++) {
      if (!rng.chance(Math.min(0.55, 0.12 + 0.05 * depth))) continue;
      const kinds: ('open' | 'closed' | 'gate')[] = ['open'];
      if (closedLeft > 0) kinds.push('closed');
      if (depth >= 6) kinds.push('gate', 'gate');
      const kind = rng.pick(kinds);
      const c = centers[si];
      // fechado precisa de espaço dentro para a Saltadora pousar; aberto/porteira podem ser mais justos
      const R = squadExtent(c, enemies.filter((e) => e.squad === si)) + (kind === 'closed' ? 1.2 : 1.0);
      const n = Math.max(9, Math.round((Math.PI * 2 * R) / 0.62));
      const segLen = 2 * R * Math.sin(Math.PI / n) + 0.06;
      const th = 0.28;
      const style: WallStyle = kind === 'closed' ? 'crate' : kind === 'gate' ? 'stone' : rng.pick(['stone', 'hedge'] as WallStyle[]);
      const h = style === 'hedge' ? 0.7 : style === 'crate' ? 0.6 : 0.55;
      const toT = Math.atan2(trigger.z - c.z, trigger.x - c.x); // ângulo (no plano x,z) do pelotão para o gatilho
      // abertura: de lado (±90° do gatilho) no aberto; porteira: virada para o lado do gatilho
      const gapA = kind === 'open' ? toT + (rng.chance(0.5) ? 1 : -1) * rng.range(1.3, 2.0) : toT + rng.range(-0.6, 0.6);
      const gapK = ((Math.round(((gapA / (Math.PI * 2)) * n - 0.5)) % n) + n) % n;
      const g = ++groupId;
      const segs: WallSpec[] = [];
      let gate: GateSpec | null = null;
      for (let s = 0; s < n; s++) {
        const a = ((s + 0.5) / n) * Math.PI * 2;
        const px = c.x + Math.cos(a) * R, pz = c.z + Math.sin(a) * R;
        const tx = -Math.sin(a), tz = Math.cos(a);
        const yaw = Math.atan2(-tz, tx);
        const dk = Math.min((s - gapK + n) % n, (gapK - s + n) % n);
        // aberto e porteira: vão de 2 segmentos (~1,2 m, cabe a corrente passando reta)
        if (kind !== 'closed' && dk <= 1 && s !== (gapK + 1) % n) {
          if (kind === 'gate' && s === gapK) {
            // grade na corda entre o começo do segmento gapK-1 e o fim do gapK
            const b = (gapK / n) * Math.PI * 2, rc = R * Math.cos(Math.PI / n);
            const gx = c.x + Math.cos(b) * rc, gz = c.z + Math.sin(b) * rc;
            gate = { x: gx, z: gz, w: 2 * R * Math.sin((Math.PI * 2) / n) + 0.04, d: 0.12, h: 0.65, yaw: Math.atan2(-Math.cos(b), -Math.sin(b)), open: 3.0,
              lever: { x: gx, z: gz } };
            // a alavanca fica do lado de fora, entre 1,8 e 2,6 m da porteira (várias tentativas até achar lugar livre)
            const free = (L: Vec2) => inside(L.x, L.z, 0.6) && Math.hypot(L.x - trigger.x, L.z - trigger.z) >= 1.6
              && !enemies.some((e) => (e.patrol ? patrolDist(e.patrol.pts, L.x, L.z) < 0.5 : Math.hypot(e.x - L.x, e.z - L.z) < 1.0))
              && !walls.some((w) => rectDist(L.x, L.z, w) < 0.9) && Math.hypot(L.x - c.x, L.z - c.z) > R + 0.9;
            for (let t = 0; t < 10; t++) {
              const out = rng.range(1.8, 2.6), la = b + rng.range(-1.2, 1.2);
              const L = { x: gx + Math.cos(la) * out, z: gz + Math.sin(la) * out };
              if (free(L)) { gate.lever = L; break; }
            }
          }
          continue;
        }
        segs.push({ x: px, z: pz, w: segLen, d: th, h, style, yaw, group: g });
      }
      if (gate && gate.lever.x === gate.x && gate.lever.z === gate.z) continue; // não achou lugar para a alavanca
      // os segmentos do anel encostam uns nos outros de propósito; só os OUTROS muros precisam de folga
      if (!segs.every((w) => segOk(w, true) && !walls.some((o) => wallSamples(w).some((p) => rectDist(p.x, p.z, o) < 0.8)))) continue;
      walls.push(...segs);
      if (gate) gates.push(gate);
      if (kind === 'closed') closedLeft--;
    }
  }
  const styles: WallSpec['style'][] = depth < 3 ? ['stone', 'hedge'] : ['stone', 'hedge', 'crate'];
  for (let i = 0; i < nWalls; i++) {
    let placed = false;
    for (let k = 0; k < 30 && !placed; k++) {
      const gate = i === 0 || rng.chance(0.55);
      const th = rng.range(0.28, 0.38);
      const style = rng.pick(styles);
      const h = style === 'hedge' ? 0.7 : style === 'crate' ? 0.6 : 0.55;
      // ponto e direção "do caminho" (para a porteira) ou um ponto qualquer (avulso)
      let mx: number, mz: number, pathX: number, pathZ: number;
      if (gate) {
        const c = rng.pick(centers);
        const t = rng.range(0.38, 0.66);
        mx = trigger.x + (c.x - trigger.x) * t; mz = trigger.z + (c.z - trigger.z) * t;
        const L = Math.hypot(c.x - trigger.x, c.z - trigger.z) || 1;
        pathX = (c.x - trigger.x) / L; pathZ = (c.z - trigger.z) / L;
        const off = rng.range(-0.5, 0.5);
        mx += -pathZ * off; mz += pathX * off;
      } else {
        mx = rng.range(-5, 7); mz = rng.range(-4, 4);
        const a = rng.range(0, Math.PI * 2);
        pathX = Math.cos(a); pathZ = Math.sin(a);
      }
      const tutorial = depth === 1 && i === 0; // o 1º muro do jogo é sempre reto
      const shape = tutorial ? 'straight' : depth >= 2 && rng.chance(0.3) ? 'curve' : depth >= 1 && rng.chance(0.35) ? 'L' : 'straight';
      const g = ++groupId;
      const segs: WallSpec[] = [];
      if (shape === 'straight') {
        const len = rng.range(1.3, 2.5);
        // atravessado no caminho (eixos alinhados, como antes)
        const vertical = Math.abs(pathX) > Math.abs(pathZ);
        segs.push(vertical ? { x: mx, z: mz, w: th, d: len, h, style } : { x: mx, z: mz, w: len, d: th, h, style });
      } else if (shape === 'L') {
        // canto em (mx, mz); um braço atravessa o caminho, o outro volta na direção do gatilho ou dos inimigos
        const la = rng.range(1.2, 2.0), lb = rng.range(0.9, 1.6);
        const vertical = Math.abs(pathX) > Math.abs(pathZ);
        const sa = rng.chance(0.5) ? 1 : -1, sb = rng.chance(0.5) ? 1 : -1;
        if (vertical) {
          segs.push({ x: mx, z: mz + sa * (la / 2 - th / 2), w: th, d: la, h, style, group: g });
          segs.push({ x: mx + sb * (lb / 2 - th / 2), z: mz, w: lb, d: th, h, style, group: g });
        } else {
          segs.push({ x: mx + sa * (la / 2 - th / 2), z: mz, w: la, d: th, h, style, group: g });
          segs.push({ x: mx, z: mz + sb * (lb / 2 - th / 2), w: th, d: lb, h, style, group: g });
        }
      } else {
        // arco: o meio dele fica no ponto escolhido, curvado para o gatilho ou para os inimigos
        const R = rng.range(1.2, 1.9), sweep = rng.range(1.2, 2.1), n = Math.max(5, Math.round(sweep * 3.2));
        const bend = rng.chance(0.5) ? 1 : -1;
        const cx = mx + pathX * R * bend, cz = mz + pathZ * R * bend;
        const mid = Math.atan2(mz - cz, mx - cx);
        const segLen = 2 * R * Math.sin(sweep / (2 * n)) + 0.08;
        for (let s = 0; s < n; s++) {
          const a = mid - sweep / 2 + sweep * (s + 0.5) / n;
          const px = cx + Math.cos(a) * R, pz = cz + Math.sin(a) * R;
          const tx = -Math.sin(a), tz = Math.cos(a); // tangente
          segs.push({ x: px, z: pz, w: segLen, d: th, h, style, yaw: Math.atan2(-tz, tx), group: g });
        }
      }
      if (segs.every((w) => segOk(w))) { walls.push(...segs); placed = true; }
    }
  }

  // par por DISTÂNCIA (alcance médio de um deck misto), não por contagem de Comuns
  const par = Math.max(6, Math.ceil(routeLength(trigger, centers, nWalls) / PAR_REACH) + (enemies.some((e) => e.kind !== 'soldier') ? 2 : 0));
  const area = AREAS[Math.floor(depth / 3) % AREAS.length];
  let hint: string | undefined;
  if (depth === 0) hint = 'Clique no marcador VERDE e mova o mouse: a trilha aparece. Clique no chão para colocar.';
  else if (depth === 1) hint = 'Muro no caminho! Faça a curva desenhando em volta dele.';
  else if (depth === 2) hint = 'Dois pelotões: use a BIFURCAÇÃO para dividir a corrente.';
  else if (enemies.some((e) => e.kind === 'brute') && depth <= 4) hint = 'Brutamontes aguentam 2 golpes. Pesada ou Torre derrubam de uma vez!';
  else if (enemies.some((e) => e.patrol) && depth <= 4) hint = 'Patrulheiro! Ele empurra peças em pé no caminho dele. Dispare na hora certa.';
  else if (enemies.some((e) => e.kind === 'torcher') && depth <= 7 && !boss) hint = 'Tocheiro! A tocha dele QUEIMA peças em pé no caminho. Mas uma peça caindo nele derruba.';
  else if (boss) hint ='O GENERAL aguenta 4 golpes. Explosivas e Pesadas ajudam muito!';
  if (!boss && depth <= 9) {
    if (gates.length) hint = 'PORTEIRA! Derrube a ALAVANCA e a grade abre por 3 s. Use a Bifurcação: um ramo na alavanca, o outro passa pela grade.';
    else if (enemies.some((e) => e.kind === 'archer')) hint = 'ARQUEIRO! A 1ª peça que se mexer no círculo dele leva a flecha. Dê uma isca (Bifurcação) ou mande o Foguete.';
    else if (enemies.some((e) => e.kind === 'ogre')) hint = 'OGRO! Ele esmaga peças em pé no caminho e aguenta 3 golpes. Derrubado, cai como um dominó gigante.';
    else if (walls.some((w) => w.group && w.style === 'crate' && walls.filter((o) => o.group === w.group).length > 8)) hint = 'Pelotão cercado! Só a SALTADORA passa por cima dos caixotes.';
  }

  return {
    depth, seed: runSeed,
    title: boss ? 'Fortaleza do General' : `Fase ${depth + 1}`,
    subtitle: area,
    trigger, enemies, walls, gates, par, boss, hint,
  };
}
