import { Layout, Placed, Stroke, Fail, wrapAngle } from './layout';
import { PieceId, PIECES } from './pieces';
import { EnemySpec, BOARD, ENEMY_RADIUS, rectDist } from './mapgen';

// Bot de planejamento (puro): estratégia "pente" — tronco do gatilho até perto de cada pelotão,
// bifurca antes de chegar (meia A entra no pelotão, meia B segue p/ o próximo). Serve de demo,
// de teste de ponta a ponta e de prova de que as fases geradas são vencíveis.
interface Target { x: number; z: number; members: EnemySpec[] }

function squads(enemies: EnemySpec[]): Target[] {
  const by = new Map<number, EnemySpec[]>();
  for (const e of enemies) {
    if (e.patrol) continue;
    if (!by.has(e.squad)) by.set(e.squad, []);
    by.get(e.squad)!.push(e);
  }
  return [...by.values()].map((m) => ({
    x: m.reduce((s, e) => s + e.x, 0) / m.length,
    z: m.reduce((s, e) => s + e.z, 0) / m.length,
    members: m,
  }));
}

function nearestMember(t: Target, x: number, z: number): EnemySpec {
  let best = t.members[0], bd = Infinity;
  for (const m of t.members) {
    const d = Math.hypot(m.x - x, m.z - z);
    if (d < bd) { bd = d; best = m; }
  }
  return best;
}

const OFFS = [0, 20, -20, 40, -40, 60, -60, 85, -85, 110, -110].map((d) => (d * Math.PI) / 180);

function pickType(L: Layout, prefer: PieceId[]): PieceId | null {
  for (const t of prefer) if (L.hand[t] > 0) return t;
  for (const t of ['common', 'heavy', 'big', 'tower', 'runner'] as PieceId[]) if (L.hand[t] > 0) return t;
  return null;
}

// ---------- A* em grade de 0,2 m (obstáculos inflados p/ caber o raio de curva) ----------
const CELL = 0.2;
const GW = Math.round(BOARD.w / CELL), GD = Math.round(BOARD.d / CELL);

function blockedGrid(L: Layout, goal: { x: number; z: number }, headId: number): Uint8Array {
  const g = new Uint8Array(GW * GD);
  const s = L.spec;
  for (let j = 0; j < GD; j++) for (let i = 0; i < GW; i++) {
    const x = -BOARD.w / 2 + (i + 0.5) * CELL, z = -BOARD.d / 2 + (j + 0.5) * CELL;
    let b = Math.abs(x) > BOARD.w / 2 - 0.45 || Math.abs(z) > BOARD.d / 2 - 0.45;
    if (!b) for (const w of s.walls) if (rectDist(x, z, w) < 0.5) { b = true; break; }
    if (!b) for (const l of s.lava) if (Math.hypot(l.x - x, l.z - z) < l.r + 0.42) { b = true; break; }
    if (!b) for (const e of s.enemies) {
      if (e.patrol) continue;
      const d = Math.hypot(e.x - x, e.z - z);
      if (d < ENEMY_RADIUS[e.kind] + 0.55 && Math.hypot(goal.x - e.x, goal.z - e.z) > 0.9) { b = true; break; }
    }
    if (!b) for (const p of L.pieces) if (p.id !== headId && Math.hypot(p.x - x, p.z - z) < 0.42) { b = true; break; }
    g[j * GW + i] = b ? 1 : 0;
  }
  return g;
}

function astar(L: Layout, from: { x: number; z: number }, to: { x: number; z: number }, headId: number): { x: number; z: number }[] | null {
  const g = blockedGrid(L, to, headId);
  const ci = (x: number) => Math.max(0, Math.min(GW - 1, Math.floor((x + BOARD.w / 2) / CELL)));
  const cj = (z: number) => Math.max(0, Math.min(GD - 1, Math.floor((z + BOARD.d / 2) / CELL)));
  const si = ci(from.x), sj = cj(from.z), ti = ci(to.x), tj = cj(to.z);
  // libera a vizinhança do início e do fim (a ponta e o alvo ficam dentro de áreas infladas)
  for (const [ai, aj, r] of [[si, sj, 2], [ti, tj, 4]] as const)
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      const i = ai + di, j = aj + dj;
      if (i >= 0 && j >= 0 && i < GW && j < GD && (ai === ti || di * di + dj * dj <= r * r)) {
        if (ai === si) g[j * GW + i] = 0; else if (g[j * GW + i] && Math.hypot(di, dj) <= 3) g[j * GW + i] = 0;
      }
    }
  const N = GW * GD;
  const cost = new Float32Array(N).fill(Infinity);
  const prev = new Int32Array(N).fill(-1);
  const open: number[] = [];
  const h = (k: number) => Math.hypot((k % GW) - ti, Math.floor(k / GW) - tj);
  const start = sj * GW + si, goal = tj * GW + ti;
  cost[start] = 0;
  open.push(start);
  const fScore = new Float32Array(N).fill(Infinity);
  fScore[start] = h(start);
  while (open.length) {
    let bi = 0;
    for (let k = 1; k < open.length; k++) if (fScore[open[k]] < fScore[open[bi]]) bi = k;
    const cur = open.splice(bi, 1)[0];
    if (cur === goal) break;
    const cx = cur % GW, cz = Math.floor(cur / GW);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const nx = cx + dx, nz = cz + dz;
      if (nx < 0 || nz < 0 || nx >= GW || nz >= GD) continue;
      const k = nz * GW + nx;
      if (g[k]) continue;
      const c = cost[cur] + (dx && dz ? 1.414 : 1);
      if (c < cost[k]) {
        cost[k] = c; prev[k] = cur; fScore[k] = c + h(k);
        if (!open.includes(k)) open.push(k);
      }
    }
  }
  if (!isFinite(cost[goal])) return null;
  const path: { x: number; z: number }[] = [];
  for (let k = goal; k !== -1; k = prev[k]) path.push({ x: -BOARD.w / 2 + ((k % GW) + 0.5) * CELL, z: -BOARD.d / 2 + (Math.floor(k / GW) + 0.5) * CELL });
  return path.reverse();
}

/** Dirige o traço até ficar a `stop` do alvo (ou travar), seguindo o A*. */
function drive(L: Layout, st: Stroke, gx: number, gz: number, stop: number, final: (h: Placed) => PieceId[], maxSteps = 90): Fail | 'arrived' | 'stuck' {
  let path: { x: number; z: number }[] | null = null;
  for (let i = 0; i < maxSteps; i++) {
    const h = L.get(st.head)!;
    const dist = Math.hypot(gx - h.x, gz - h.z);
    if (dist <= stop) return 'arrived';
    if (!path || i % 6 === 0) path = astar(L, h, { x: gx, z: gz }, h.id);
    let ax = gx, az = gz;
    if (path && dist > 1.0) {
      let ci = 0, cd = Infinity;
      path.forEach((p, k) => { const d = Math.hypot(p.x - h.x, p.z - h.z); if (d < cd) { cd = d; ci = k; } });
      const look = path[Math.min(path.length - 1, ci + 5)];
      ax = look.x; az = look.z;
    }
    const base = Math.atan2(ax - h.x, az - h.z);
    const prefer = final(h);
    const type = pickType(L, prefer);
    if (!type) return 'empty';
    let placed = false;
    let lastFail: Fail | undefined;
    for (const off of OFFS) {
      const a = base + off;
      const step = PIECES[type].step;
      const r = L.extend(st, h.x + Math.sin(a) * step * 1.02, h.z + Math.cos(a) * step * 1.02, type);
      if (r.placed.length) { placed = true; break; }
      lastFail = r.fail;
      if (off === 0 && r.fail === 'enemy' && dist < 1.0) return 'arrived';
    }
    if (!placed) return lastFail ?? 'stuck';
  }
  return 'stuck';
}

export function autoPlanTree(L: Layout): { ok: boolean; note: string } {
  const spec = L.spec;
  const targets = squads(spec.enemies);
  if (!targets.length) return { ok: false, note: 'sem alvos' };
  // ordem: vizinho mais próximo a partir do gatilho
  const order: Target[] = [];
  const left = targets.slice();
  let cx = spec.trigger.x, cz = spec.trigger.z;
  while (left.length) {
    let bi = 0, bd = Infinity;
    left.forEach((t, i) => { const d = Math.hypot(t.x - cx, t.z - cz); if (d < bd) { bd = d; bi = i; } });
    const t = left.splice(bi, 1)[0];
    order.push(t); cx = t.x; cz = t.z;
  }
  const firstType = pickType(L, ['common']);
  if (!firstType) return { ok: false, note: 'mão vazia' };
  const b = L.begin(spec.trigger.x, spec.trigger.z, firstType);
  if (!b.stroke) return { ok: false, note: 'gatilho' };
  let st = b.stroke;
  // perto do alvo: pesada/torre derrubam brutamontes de uma vez
  const finisher = (t: Target) => (h: Placed): PieceId[] => {
    const m = nearestMember(t, h.x, h.z);
    const near = Math.hypot(m.x - h.x, m.z - h.z) < 1.0;
    if (near && (m.kind === 'brute' || m.kind === 'general')) return ['heavy', 'tower', 'blast', 'common'];
    return ['common'];
  };
  const notes: string[] = [];
  // lado de um ponto em relação à ponta (produto vetorial 2D com a direção dela)
  const side = (h: Placed, x: number, z: number) => Math.sin(h.yaw) * (z - h.z) - Math.cos(h.yaw) * (x - h.x);

  // árvore: aproxima do grupo, bifurca, divide os alvos por lado e recursa em cada metade
  const branch = (s: Stroke, group: Target[], tag: string): void => {
    if (group.length === 1 || L.hand.fork <= 0) {
      let rest = group.slice();
      while (rest.length) {
        const h = L.get(s.head)!;
        rest.sort((a, b) => Math.hypot(a.x - h.x, a.z - h.z) - Math.hypot(b.x - h.x, b.z - h.z));
        const t = rest.shift()!;
        const m = nearestMember(t, h.x, h.z);
        const r = drive(L, s, m.x, m.z, 0.3, finisher(t));
        if (r !== 'arrived') notes.push(`${tag}: ${r}`);
        if (rest.length) {
          // sem bifurcação: contorna o pelotão e segue (o corpo arremessado pode derrubar a próxima)
          notes.push(`${tag}: sem bifurcação`);
          return;
        }
      }
      return;
    }
    const cx = group.reduce((a, t) => a + t.x, 0) / group.length;
    const cz = group.reduce((a, t) => a + t.z, 0) / group.length;
    let h = L.get(s.head)!;
    const dist = Math.hypot(cx - h.x, cz - h.z);
    const nearest = Math.min(...group.map((t) => { const m = nearestMember(t, h.x, h.z); return Math.hypot(m.x - h.x, m.z - h.z); }));
    // anda um pouco em direção ao centro do grupo (sem chegar perto demais de ninguém)
    const walk = Math.min(1.6, Math.max(0.8, nearest - 2.2));
    const gx = h.x + ((cx - h.x) / dist) * walk, gz = h.z + ((cz - h.z) / dist) * walk;
    drive(L, s, gx, gz, 0.2, () => ['common'], 8);
    let halves: Placed[] = [];
    for (let tryF = 0; tryF < 4 && halves.length !== 2; tryF++) {
      h = L.get(s.head)!;
      const before = new Set(L.pieces.map((p) => p.id));
      const fr = L.extend(s, h.x + Math.sin(h.yaw) * 0.4, h.z + Math.cos(h.yaw) * 0.4, 'fork');
      if (fr.placed.length === 2) { halves = L.pieces.filter((p) => !before.has(p.id)); break; }
      s.done = false;
      const a = Math.atan2(cx - h.x, cz - h.z) + (tryF % 2 ? 0.4 : -0.4);
      const t2 = pickType(L, ['common']);
      if (!t2 || !L.extend(s, h.x + Math.sin(a) * 0.4, h.z + Math.cos(a) * 0.4, t2).placed.length) break;
    }
    if (halves.length !== 2) {
      notes.push(`${tag}: bifurcação não coube`);
      s.done = false;
      return branch(s, [group[0]], tag);
    }
    h = L.get(halves[0].parent)!;
    const sorted = group.slice().sort((a, b) => side(h, a.x, a.z) - side(h, b.x, b.z));
    const k = Math.ceil(sorted.length / 2);
    const [lo, hi] = side(h, halves[0].x, halves[0].z) < side(h, halves[1].x, halves[1].z) ? [halves[0], halves[1]] : [halves[1], halves[0]];
    branch({ head: lo.id, done: false, id: s.id }, sorted.slice(0, k), tag + 'L');
    branch({ head: hi.id, done: false, id: s.id }, sorted.slice(k), tag + 'R');
  };
  branch(st, order, 'r');
  return { ok: notes.length === 0, note: notes.join('; ') };
}

export function autoPlanComb(L: Layout): { ok: boolean; note: string } {
  const spec = L.spec;
  const targets = squads(spec.enemies);
  if (!targets.length) return { ok: false, note: 'sem alvos' };
  // ordem: vizinho mais próximo a partir do gatilho
  const order: Target[] = [];
  const left = targets.slice();
  let cx = spec.trigger.x, cz = spec.trigger.z;
  while (left.length) {
    let bi = 0, bd = Infinity;
    left.forEach((t, i) => { const d = Math.hypot(t.x - cx, t.z - cz); if (d < bd) { bd = d; bi = i; } });
    const t = left.splice(bi, 1)[0];
    order.push(t); cx = t.x; cz = t.z;
  }
  const firstType = pickType(L, ['common']);
  if (!firstType) return { ok: false, note: 'mão vazia' };
  const b = L.begin(spec.trigger.x, spec.trigger.z, firstType);
  if (!b.stroke) return { ok: false, note: 'gatilho' };
  let st = b.stroke;
  // perto do alvo: pesada/torre derrubam brutamontes de uma vez
  const finisher = (t: Target) => (h: Placed): PieceId[] => {
    const m = nearestMember(t, h.x, h.z);
    const near = Math.hypot(m.x - h.x, m.z - h.z) < 1.0;
    if (near && (m.kind === 'brute' || m.kind === 'general')) return ['heavy', 'tower', 'blast', 'common'];
    return ['common'];
  };
  const notes: string[] = [];
  for (let i = 0; i < order.length; i++) {
    const t = order[i];
    const next = order[i + 1];
    if (next && L.hand.fork > 0) {
      const m = nearestMember(t, L.get(st.head)!.x, L.get(st.head)!.z);
      // bifurca cedo (≈2 m antes), mirando entre o pelotão atual e o próximo: os ramos têm espaço p/ abrir
      const r = drive(L, st, m.x, m.z, 2.1, () => ['common']);
      if (r !== 'arrived') notes.push(`aprox ${i}: ${r}`);
      let halves: Placed[] = [];
      let lastForkFail = '';
      // tenta bifurcar; se não cabe, avança 1 peça e tenta de novo
      for (let tryF = 0; tryF < 5 && halves.length !== 2; tryF++) {
        const h = L.get(st.head)!;
        const a1 = Math.atan2(m.x - h.x, m.z - h.z), a2 = Math.atan2(next.x - h.x, next.z - h.z);
        const base = a1 + Math.max(-0.45, Math.min(0.45, wrapAngle(a2 - a1) / 2));
        for (const off of [0, 0.3, -0.3, 0.6, -0.6]) {
          const before = new Set(L.pieces.map((p) => p.id));
          const fr = L.extend(st, h.x + Math.sin(base + off) * 0.4, h.z + Math.cos(base + off) * 0.4, 'fork');
          if (fr.placed.length === 2) { halves = L.pieces.filter((p) => !before.has(p.id)); break; }
          if (fr.fail) lastForkFail = fr.fail + (st.done ? '!done' : '');
        }
        if (halves.length !== 2) {
          const t2 = pickType(L, ['common']);
          if (!t2) break;
          const r = L.extend(st, h.x + Math.sin(base + (tryF % 2 ? 0.5 : -0.5)) * 0.4, h.z + Math.cos(base + (tryF % 2 ? 0.5 : -0.5)) * 0.4, t2);
          if (!r.placed.length) break;
        }
      }
      if (halves.length === 2) {
        const [p, q] = halves;
        const dp = Math.hypot(p.x - m.x, p.z - m.z) + Math.hypot(q.x - next.x, q.z - next.z);
        const dq = Math.hypot(q.x - m.x, q.z - m.z) + Math.hypot(p.x - next.x, p.z - next.z);
        const A = dp <= dq ? p : q, B = dp <= dq ? q : p;
        const sa: Stroke = { head: A.id, done: false, id: st.id };
        const ra = drive(L, sa, m.x, m.z, 0.3, finisher(t));
        if (ra !== 'arrived') notes.push(`ramo ${i}: ${ra}`);
        st = { head: B.id, done: false, id: st.id };
        continue;
      }
      notes.push(`fork ${i} falhou(${lastForkFail})`);
      st.done = false;
    }
    const h = L.get(st.head)!;
    const m = nearestMember(t, h.x, h.z);
    const r = drive(L, st, m.x, m.z, 0.3, finisher(t));
    if (r !== 'arrived') notes.push(`alvo ${i}: ${r}`);
  }
  return { ok: notes.length === 0, note: notes.join('; ') };
}

export type Strategy = 'comb' | 'tree';
export function autoPlan(L: Layout, strategy: Strategy = 'comb'): { ok: boolean; note: string } {
  return strategy === 'tree' ? autoPlanTree(L) : autoPlanComb(L);
}
