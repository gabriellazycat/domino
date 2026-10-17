import { PIECES } from './pieces';
import type { Placed } from './layout';
import { BOARD, ENEMY_HP, ENEMY_RADIUS, PhaseSpec, Rect, Vec2, rectDist } from './mapgen';

// Movimentos roteirizados (puros): o FOGUETE corre no chão numa linha que ricocheteia nos muros, e a
// SALTADORA (ou a peça com selo Mola) salta num arco por cima de tudo. O planejamento e a física usam
// as mesmas contas, então o que o jogador vê na prévia é exatamente o que acontece.

/** Quanto o Foguete corre (m) e a que velocidade. */
export const RUNNER_RANGE = 3.2;
export const RUNNER_SPEED = 6.5;
const RUNNER_R = 0.2;
/** Onde a peça seguinte nasce depois do salto (m) e quanto antes dela a Saltadora pousa. */
export const JUMP_DIST = 2.2;
export const JUMP_SHORT = 0.4;
export const JUMP_APEX = 1.5;
export const JUMP_TIME = 0.75;
/** Folga entre o fim da corrida do Foguete e a peça seguinte (ele tomba em cima dela). */
const RUN_GAP = 0.3;

/** A peça salta quando é derrubada: Saltadora ou qualquer peça com o selo Mola. */
export function jumps(p: Pick<Placed, 'type' | 'card'>): boolean {
  return p.type === 'jumper' || !!p.card?.seals.includes('spring');
}

export interface RunPath { pts: Vec2[]; end: Vec2; yaw: number; len: number }

/** Muros e porteiras (fechadas) onde o Foguete quica. */
function obstacles(spec: PhaseSpec): Rect[] {
  return [...spec.walls, ...(spec.gates ?? [])];
}

/** Normal (mundo) da face do retângulo mais perto do ponto. */
function rectNormal(px: number, pz: number, r: Rect): Vec2 {
  const c = Math.cos(r.yaw ?? 0), s = Math.sin(r.yaw ?? 0);
  const dx = px - r.x, dz = pz - r.z;
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  const ox = Math.abs(lx) - r.w / 2, oz = Math.abs(lz) - r.d / 2;
  const nlx = ox > oz ? Math.sign(lx) : 0, nlz = ox > oz ? 0 : Math.sign(lz);
  return { x: nlx * c + nlz * s, z: -nlx * s + nlz * c };
}

/**
 * Trajeto do Foguete: reto até `range`, quicando em muros, porteiras e na borda da mesa (até 4 vezes).
 * Para antes de um inimigo parado que aguenta o golpe (Brutamontes, General): ali ele trava.
 */
export function runnerPath(spec: PhaseSpec, x: number, z: number, yaw: number, range = RUNNER_RANGE): RunPath {
  const rects = obstacles(spec);
  const tough = spec.enemies.filter((e) => !e.patrol && ENEMY_HP[e.kind] > 1);
  let dx = Math.sin(yaw), dz = Math.cos(yaw);
  let px = x, pz = z, run = 0, bounces = 0;
  const pts: Vec2[] = [{ x, z }];
  const ds = 0.03;
  const ex = BOARD.w / 2 - 0.3, ez = BOARD.d / 2 - 0.3;
  for (let guard = 0; guard < 2000 && run < range; guard++) {
    const nx = px + dx * ds, nz = pz + dz * ds;
    if (tough.some((e) => Math.hypot(e.x - nx, e.z - nz) < ENEMY_RADIUS[e.kind] + RUNNER_R)) break;
    let n: Vec2 | null = null;
    if (Math.abs(nx) > ex) n = { x: -Math.sign(nx), z: 0 };
    else if (Math.abs(nz) > ez) n = { x: 0, z: -Math.sign(nz) };
    else for (const r of rects) if (rectDist(nx, nz, r) < RUNNER_R) { n = rectNormal(nx, nz, r); break; }
    if (n) {
      if (++bounces > 4) break;
      const dot = dx * n.x + dz * n.z;
      if (dot < 0) { dx -= 2 * dot * n.x; dz -= 2 * dot * n.z; }
      const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      pts.push({ x: px, z: pz });
      continue;
    }
    px = nx; pz = nz; run += ds;
  }
  pts.push({ x: px, z: pz });
  return { pts, end: { x: px, z: pz }, yaw: Math.atan2(dx, dz), len: run };
}

/** Ponto a `s` metros do começo do trajeto (com a direção naquele trecho). */
export function alongPath(pts: Vec2[], s: number): { x: number; z: number; yaw: number } {
  let left = s;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    if (L < 1e-6) continue;
    const yaw = Math.atan2(b.x - a.x, b.z - a.z);
    if (left <= L) { const t = left / L; return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, yaw }; }
    left -= L;
  }
  const n = pts.length;
  const a = pts[Math.max(0, n - 2)], b = pts[n - 1];
  return { x: b.x, z: b.z, yaw: Math.atan2(b.x - a.x, b.z - a.z) };
}

/**
 * De onde a próxima peça sai depois da ponta `h`: origem, direção e distância. Peça comum: a queda dela
 * (o `step` do catálogo). Foguete: o fim da corrida. Saltadora/Mola: o salto.
 */
export function launchOf(h: Placed, spec: PhaseSpec): { x: number; z: number; yaw: number; step: number; kind: 'fall' | 'run' | 'jump' } {
  if (h.type === 'runner') {
    const r = runnerPath(spec, h.x, h.z, h.yaw);
    const fx = Math.sin(r.yaw), fz = Math.cos(r.yaw);
    const back = PIECES.common.step - RUN_GAP;
    return { x: r.end.x - fx * back, z: r.end.z - fz * back, yaw: r.yaw, step: PIECES.common.step, kind: 'run' };
  }
  if (jumps(h)) return { x: h.x, z: h.z, yaw: h.yaw, step: JUMP_DIST, kind: 'jump' };
  return { x: h.x, z: h.z, yaw: h.yaw, step: PIECES[h.type].step, kind: 'fall' };
}

/** Onde a peça que salta pousa (um pouco antes de onde a seguinte nasce). */
export function jumpLanding(p: Pick<Placed, 'x' | 'z' | 'yaw'>): Vec2 {
  const d = JUMP_DIST - JUMP_SHORT;
  return { x: p.x + Math.sin(p.yaw) * d, z: p.z + Math.cos(p.yaw) * d };
}
