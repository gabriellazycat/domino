import RAPIER from '@dimforge/rapier3d-compat';
import { PIECES } from '../core/pieces';
import { Placed } from '../core/layout';
import { EnemySpec, ENEMY_HP, ENEMY_RADIUS, PhaseSpec, BOARD } from '../core/mapgen';

// Simulação física (Rapier). Mesma física para o jogo ao vivo e para o bot/testes headless.
// Assistência "encostou, derruba" (herdada do Topple Unity): peça em pé tocada por corpo dinâmico
// recebe um giro para onde APONTA — a física anima a queda, a corrente nunca morre por raspão.

export const ENEMY_HEIGHT: Record<string, number> = { soldier: 0.9, patroller: 0.9, brute: 1.15, general: 1.35 };
const ENEMY_DENSITY: Record<string, number> = { soldier: 8, patroller: 8, brute: 20, general: 22 };
export const BLAST_RADIUS = 1.7;
const GRAVITY = -11;
const DT = 1 / 120;
const KICK = 4.6; // rad/s para peça de 0,8 m
const STANDING = (25 * Math.PI) / 180;
const FALLEN = (50 * Math.PI) / 180;
const SPLASH_R = 0.85;

export type Cause = 'piece' | 'heavy' | 'blast' | 'body' | 'splash' | 'runner';

export interface SimEvents {
  pieceFall?(i: number, x: number, y: number, z: number, chain: number): void;
  pieceTouch?(i: number): void;
  enemyHit?(e: SimEnemy, hpLeft: number): void;
  enemyKnock?(e: SimEnemy, cause: Cause, combo: number): void;
  explosion?(x: number, y: number, z: number, r: number): void;
  bulldoze?(x: number, z: number): void;
  runner?(i: number): void;
  allDown?(): void;
}

export interface SimPiece {
  p: Placed;
  body: RAPIER.RigidBody;
  touched: boolean;
  kicked: boolean;
  fallen: boolean;
  launched: number; // t do lançamento (foguete), -1 = não
  exploded: boolean;
  blastArm: number; // t em que a explosiva detona (-1 = não)
}

export interface SimEnemy {
  idx: number;
  spec: EnemySpec;
  body: RAPIER.RigidBody;
  hp: number;
  alive: boolean;
  knockedAt: number;
  hitBy: Set<number>;
  lastHit: number;
}

export function quatYaw(yaw: number) { return { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }; }

function tiltOf(q: RAPIER.Rotation): number {
  const upY = 1 - 2 * (q.x * q.x + q.z * q.z);
  return Math.acos(Math.max(-1, Math.min(1, upY)));
}
function facingOf(q: RAPIER.Rotation): [number, number] {
  const fx = 2 * (q.x * q.z + q.w * q.y);
  const fz = 1 - 2 * (q.x * q.x + q.y * q.y);
  const l = Math.hypot(fx, fz) || 1;
  return [fx / l, fz / l];
}

export function patrolPos(pts: { x: number; z: number }[], s: number): { x: number; z: number; yaw: number } {
  let total = 0;
  const segs: number[] = [];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const l = Math.hypot(b.x - a.x, b.z - a.z);
    segs.push(l); total += l;
  }
  let d = ((s % total) + total) % total;
  for (let i = 0; i < pts.length; i++) {
    if (d <= segs[i]) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const t = d / (segs[i] || 1);
      return { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, yaw: Math.atan2(b.x - a.x, b.z - a.z) };
    }
    d -= segs[i];
  }
  return { x: pts[0].x, z: pts[0].z, yaw: 0 };
}

export class Sim {
  world: RAPIER.World;
  queue: RAPIER.EventQueue;
  pieces: SimPiece[] = [];
  enemies: SimEnemy[] = [];
  t = 0;
  fired = false;
  done = false;
  win = false;
  combo = 0;
  bestCombo = 0;
  lastKnockT = -9;
  chain = 0;
  explosions = 0;
  allDownAt = -1;
  recentFalls: { x: number; z: number; t: number }[] = [];
  private acc = 0;
  private quietFor = 0;
  private owner = new Map<number, { kind: 'piece' | 'enemy'; i: number }>();
  private pendingSplash: { e: SimEnemy; at: number; fx: number; fz: number; src: number }[] = [];
  private pendingBlast: { i: number; at: number }[] = [];

  constructor(public spec: PhaseSpec, layout: Placed[], public patrolOffset: number, public ev: SimEvents = {}) {
    this.world = new RAPIER.World({ x: 0, y: GRAVITY, z: 0 });
    this.world.timestep = DT;
    const ip = this.world.integrationParameters as any;
    if ('numSolverIterations' in ip) ip.numSolverIterations = 8;
    this.queue = new RAPIER.EventQueue(true);

    // chão + bordas baixas da mesa
    const ground = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(0, -0.25, 0));
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(BOARD.w / 2 + 5, 0.25, BOARD.d / 2 + 4).setFriction(0.75), ground);
    for (const w of spec.walls) {
      const b = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(w.x, w.h / 2, w.z));
      this.world.createCollider(RAPIER.ColliderDesc.cuboid(w.w / 2, w.h / 2, w.d / 2).setFriction(0.6), b);
    }

    layout.forEach((p, i) => {
      const d = PIECES[p.type];
      const q = quatYaw(p.yaw);
      const body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic().setTranslation(p.x, d.h / 2 + 0.001, p.z).setRotation(q)
          .setCanSleep(true).setSleeping(true).setCcdEnabled(true).setAngularDamping(0.05));
      const col = this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(d.w / 2, d.h / 2, d.t / 2).setFriction(0.6).setRestitution(0.02)
          .setDensity(p.type === 'heavy' ? 14 : 6).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS), body);
      this.owner.set(col.handle, { kind: 'piece', i });
      this.pieces.push({ p, body, touched: false, kicked: false, fallen: false, launched: -1, exploded: false, blastArm: -1 });
    });

    spec.enemies.forEach((e, i) => {
      const h = ENEMY_HEIGHT[e.kind], r = ENEMY_RADIUS[e.kind];
      let desc: RAPIER.RigidBodyDesc;
      let x = e.x, z = e.z, yaw = e.yaw;
      if (e.patrol) {
        const pp = patrolPos(e.patrol.pts, patrolOffset * e.patrol.speed);
        x = pp.x; z = pp.z; yaw = pp.yaw;
        desc = RAPIER.RigidBodyDesc.kinematicPositionBased();
      } else {
        desc = RAPIER.RigidBodyDesc.dynamic().setCanSleep(true).setSleeping(true);
      }
      const body = this.world.createRigidBody(desc.setTranslation(x, h / 2 + 0.002, z).setRotation(quatYaw(yaw)));
      if (!e.patrol) body.lockRotations(true, false);
      const col = this.world.createCollider(
        RAPIER.ColliderDesc.cylinder(h / 2, r).setFriction(0.8).setDensity(ENEMY_DENSITY[e.kind])
          .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS), body);
      this.owner.set(col.handle, { kind: 'enemy', i });
      this.enemies.push({ idx: i, spec: e, body, hp: ENEMY_HP[e.kind], alive: true, knockedAt: -1, hitBy: new Set(), lastHit: -9 });
    });
  }

  get alive(): number { return this.enemies.filter((e) => e.alive).length; }

  fire() {
    if (this.fired || !this.pieces.length) return;
    this.fired = true;
    // a raiz (1ª peça colocada) recebe o impulso
    const root = this.pieces.find((s) => s.p.parent === -1) ?? this.pieces[0];
    this.kickPiece(root, 1.0);
  }

  private kickPiece(s: SimPiece, mult: number) {
    const q = s.body.rotation();
    const [fx, fz] = facingOf(q);
    const h = PIECES[s.p.type].h;
    const w = KICK * Math.sqrt(0.8 / h) * mult;
    s.body.wakeUp();
    s.body.setAngvel({ x: fz * w, y: 0, z: -fx * w }, true);
    s.kicked = true;
  }

  /** Avança a simulação em tempo real (dt de frame, já escalado). */
  advance(dt: number) {
    this.acc += Math.min(dt, 0.1);
    while (this.acc >= DT && !this.done) {
      this.acc -= DT;
      this.step();
    }
  }

  /** Roda até o fim, sem render (bot/testes). */
  runHeadless(maxT = 40): void {
    this.fire();
    while (!this.done && this.t < maxT) this.step();
    if (!this.done) this.finish();
  }

  private finish() {
    this.done = true;
    this.win = this.alive === 0;
  }

  step() {
    if (this.done) return;
    this.t += DT;
    // patrulha (cinemática)
    for (const e of this.enemies) {
      if (!e.alive || !e.spec.patrol) continue;
      const pp = patrolPos(e.spec.patrol.pts, (this.patrolOffset + this.t) * e.spec.patrol.speed);
      e.body.setNextKinematicTranslation({ x: pp.x, y: ENEMY_HEIGHT[e.spec.kind] / 2 + 0.002, z: pp.z });
      e.body.setNextKinematicRotation(quatYaw(pp.yaw));
    }
    this.world.step(this.queue);
    this.queue.drainCollisionEvents((h1, h2, started) => {
      if (!started) return;
      const a = this.owner.get(h1), b = this.owner.get(h2);
      if (a) this.onContact(a, b);
      if (b) this.onContact(b, a);
    });

    // peças: chute, queda, explosiva, foguete
    for (let i = 0; i < this.pieces.length; i++) {
      const s = this.pieces[i];
      const q = s.body.rotation();
      const tilt = tiltOf(q);
      if (s.touched && !s.kicked && tilt < STANDING && this.fired) {
        if (s.p.type === 'runner') this.launchRunner(s, i);
        else this.kickPiece(s, 1.0);
        this.ev.pieceTouch?.(i);
      }
      if (!s.fallen && tilt > FALLEN) {
        s.fallen = true;
        this.chain++;
        const tr = s.body.translation();
        this.recentFalls.push({ x: tr.x, z: tr.z, t: this.t });
        this.ev.pieceFall?.(i, tr.x, tr.y, tr.z, this.chain);
        if (s.p.type === 'blast' && !s.exploded && s.blastArm < 0) s.blastArm = this.t + 0.04;
      }
      // golpe por proximidade: o topo da peça caindo varre o inimigo (perdoa mira de raspão)
      if (s.kicked && !s.exploded && tilt > 0.5 && tilt < 1.45) {
        const tr = s.body.translation();
        const hh = PIECES[s.p.type].h / 2;
        const upx = 2 * (q.x * q.y - q.w * q.z), upy = 1 - 2 * (q.x * q.x + q.z * q.z), upz = 2 * (q.y * q.z + q.w * q.x);
        const tx = tr.x + upx * hh, ty = tr.y + upy * hh, tz = tr.z + upz * hh;
        for (const e of this.enemies) {
          if (!e.alive) continue;
          const ep = e.body.translation();
          if (ty > ENEMY_HEIGHT[e.spec.kind] + 0.1) continue;
          if (Math.hypot(ep.x - tx, ep.z - tz) < ENEMY_RADIUS[e.spec.kind] + 0.1) {
            if (e.spec.patrol) { if (tilt < 0.6) continue; }
            const heavyHit = s.p.type === 'heavy' || s.p.type === 'tower';
            this.hit(e, i, heavyHit ? 3 : 1, tr, heavyHit ? 'heavy' : 'piece');
            if (s.p.type === 'blast' && s.blastArm < 0) s.blastArm = this.t + 0.02;
          }
        }
      }
      if (s.launched >= 0 && this.t - s.launched > 1.4) {
        s.launched = -2; // volta a girar livre
        s.body.setEnabledRotations(true, true, true, true);
      }
      if (s.blastArm >= 0 && !s.exploded && this.t >= s.blastArm) this.explode(i);
      // caiu da mesa
      if (s.body.translation().y < -3 && !s.fallen) s.fallen = true;
    }
    for (const pb of this.pendingBlast.splice(0)) {
      if (this.t >= pb.at) this.explode(pb.i); else this.pendingBlast.push(pb);
    }
    for (const sp of this.pendingSplash.splice(0)) {
      if (this.t < sp.at) { this.pendingSplash.push(sp); continue; }
      if (!sp.e.alive) continue;
      // soldado cai junto; brutamontes/general levam 1 de dano por vizinho derrubado
      if (sp.e.spec.kind === 'soldier') this.knock(sp.e, sp.fx, sp.fz, 'splash', 0.8);
      else this.hit(sp.e, 2000 + sp.src, 1, { x: sp.fx, z: sp.fz }, 'splash');
    }
    if (this.t - this.lastKnockT > 1.5) this.combo = 0;

    // fim
    if (this.alive === 0 && this.allDownAt < 0) {
      this.allDownAt = this.t;
      this.ev.allDown?.();
    }
    if (this.allDownAt >= 0 && this.t - this.allDownAt > 1.6) return this.finish();
    let maxV = 0;
    for (const s of this.pieces) {
      if (s.body.isSleeping() || !s.body.isEnabled()) continue;
      if (s.body.translation().y < -1.5) { s.body.setEnabled(false); continue; }
      const v = s.body.linvel(), w = s.body.angvel();
      maxV = Math.max(maxV, Math.hypot(v.x, v.y, v.z), Math.hypot(w.x, w.y, w.z) * 0.3);
    }
    for (const e of this.enemies) {
      if (e.spec.patrol && e.alive) continue;
      if (e.body.isSleeping() || !e.body.isEnabled()) continue;
      if (e.body.translation().y < -1.5) { e.body.setEnabled(false); continue; }
      const v = e.body.linvel();
      maxV = Math.max(maxV, Math.hypot(v.x, v.y, v.z));
    }
    if (this.pendingBlast.length || this.pendingSplash.length) maxV = 1;
    this.quietFor = maxV < 0.06 ? this.quietFor + DT : 0;
    if (this.fired && this.t > 1.5 && this.quietFor > 1.2) this.finish();
    if (this.t > 28) this.finish();
  }

  private onContact(me: { kind: 'piece' | 'enemy'; i: number }, other: { kind: 'piece' | 'enemy'; i: number } | undefined) {
    if (!this.fired) return;
    if (me.kind === 'piece') {
      const s = this.pieces[me.i];
      if (!other) return; // chão/muro/estático nunca derruba
      if (other.kind === 'piece') {
        const o = this.pieces[other.i];
        if (o.kicked || o.fallen || o.launched >= 0 || !o.body.isSleeping()) s.touched = true;
      } else {
        const e = this.enemies[other.i];
        if (e.spec.patrol && e.alive) {
          // patrulheiro empurra peça em pé (estraga o caminho); peça caindo mata ele
          if (!s.kicked && tiltOf(s.body.rotation()) < STANDING) this.bulldoze(s, e);
        } else if (!e.alive) {
          s.touched = true; // corpo arremessado derruba peça
        }
        if (s.p.type === 'blast' && e.alive && !s.exploded && s.blastArm < 0) s.blastArm = this.t + 0.02;
      }
    } else {
      const e = this.enemies[me.i];
      if (!e.alive || !other) return;
      if (other.kind === 'piece') {
        const s = this.pieces[other.i];
        const moving = s.kicked || s.fallen || s.launched >= 0;
        if (!moving) return;
        if (e.spec.patrol && !s.fallen && tiltOf(s.body.rotation()) < 0.25 && s.launched < 0) return;
        const heavyHit = s.p.type === 'heavy' || s.p.type === 'tower';
        this.hit(e, other.i, heavyHit ? 3 : 1, s.body.translation(), heavyHit ? 'heavy' : s.launched >= 0 ? 'runner' : 'piece');
      } else {
        const o = this.enemies[other.i];
        if (o.alive) return;
        const v = o.body.linvel();
        if (Math.hypot(v.x, v.y, v.z) < 1.0) return;
        const dmg = o.spec.kind === 'brute' || o.spec.kind === 'general' ? 2 : 1;
        this.hit(e, 1000 + other.i, dmg, o.body.translation(), 'body');
      }
    }
  }

  private hit(e: SimEnemy, src: number, dmg: number, from: { x: number; z: number }, cause: Cause) {
    if (e.hitBy.has(src)) return;
    e.hitBy.add(src);
    e.hp -= dmg;
    if (e.hp <= 0) this.knock(e, from.x, from.z, cause, 1);
    else {
      e.lastHit = this.t;
      this.ev.enemyHit?.(e, e.hp);
    }
  }

  knock(e: SimEnemy, fx: number, fz: number, cause: Cause, strength: number) {
    if (!e.alive) return;
    e.alive = false;
    e.hp = 0;
    e.knockedAt = this.t;
    const b = e.body;
    if (e.spec.patrol) b.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    b.setEnabledRotations(true, true, true, true);
    b.setAngularDamping(2.2);
    b.setLinearDamping(0.35);
    b.wakeUp();
    const p = b.translation();
    let dx = p.x - fx, dz = p.z - fz;
    const l = Math.hypot(dx, dz);
    if (l < 1e-3) { dx = Math.sin(e.idx * 2.3); dz = Math.cos(e.idx * 2.3); } else { dx /= l; dz /= l; }
    const m = b.mass();
    const big = e.spec.kind === 'brute' || e.spec.kind === 'general';
    const sp = (big ? 2.2 : 3.0) * strength;
    b.setLinvel({ x: dx * sp, y: (big ? 2.6 : 3.4) * strength, z: dz * sp }, true);
    b.setAngvel({ x: dz * 9, y: (e.idx % 2 ? 4 : -4), z: -dx * 9 }, true);
    void m;
    if (this.t - this.lastKnockT <= 1.5) this.combo++; else this.combo = 1;
    this.lastKnockT = this.t;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    this.ev.enemyKnock?.(e, cause, this.combo);
    // pelotão cai junto (respingo em cadeia): vizinho a ≤ SPLASH_R tomba ou leva 1 de dano
    for (const o of this.enemies) {
      if (!o.alive || o === e || o.spec.squad !== e.spec.squad) continue;
      if (o.spec.kind === 'patroller') continue;
      if (Math.hypot(o.spec.x - e.spec.x, o.spec.z - e.spec.z) <= SPLASH_R + 1e-6 && !this.pendingSplash.some((s) => s.e === o && s.src === e.idx))
        this.pendingSplash.push({ e: o, at: this.t + 0.09, fx: p.x, fz: p.z, src: e.idx });
    }
  }

  private bulldoze(s: SimPiece, e: SimEnemy) {
    const pp = e.body.translation();
    const tp = s.body.translation();
    let dx = tp.x - pp.x, dz = tp.z - pp.z;
    const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    s.kicked = true;
    s.body.wakeUp();
    s.body.setLinvel({ x: dx * 1.6, y: 0.6, z: dz * 1.6 }, true);
    s.body.setAngvel({ x: dz * 5, y: 2, z: -dx * 5 }, true);
    this.ev.bulldoze?.(tp.x, tp.z);
  }

  private launchRunner(s: SimPiece, i: number) {
    const [fx, fz] = facingOf(s.body.rotation());
    s.kicked = true;
    s.launched = this.t;
    s.body.wakeUp();
    s.body.setEnabledRotations(false, true, false, true);
    s.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    s.body.setLinvel({ x: fx * 6.5, y: 0.3, z: fz * 6.5 }, true);
    const c = s.body.collider(0);
    c.setFriction(0.18);
    this.ev.runner?.(i);
  }

  private explode(i: number) {
    const s = this.pieces[i];
    if (s.exploded) return;
    s.exploded = true;
    s.kicked = true;
    this.explosions++;
    const c = s.body.translation();
    this.ev.explosion?.(c.x, c.y, c.z, BLAST_RADIUS);
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const p = e.body.translation();
      const d = Math.hypot(p.x - c.x, p.z - c.z);
      if (d <= BLAST_RADIUS + ENEMY_RADIUS[e.spec.kind]) this.knock(e, c.x, c.z, 'blast', 1.25 - 0.4 * (d / BLAST_RADIUS));
    }
    for (let j = 0; j < this.pieces.length; j++) {
      const o = this.pieces[j];
      const p = o.body.translation();
      const dx = p.x - c.x, dz = p.z - c.z;
      const d = Math.hypot(dx, dz);
      if (d > BLAST_RADIUS || j === i) continue;
      const k = 1 - d / BLAST_RADIUS;
      o.body.wakeUp();
      const nx = d > 1e-3 ? dx / d : 0, nz = d > 1e-3 ? dz / d : 0;
      o.body.applyImpulse({ x: nx * k * 0.9 * o.body.mass() * 4, y: k * o.body.mass() * 4.5, z: nz * k * 0.9 * o.body.mass() * 4 }, true);
      o.kicked = true;
      if (o.p.type === 'blast' && !o.exploded) this.pendingBlast.push({ i: j, at: this.t + 0.14 });
    }
    // o próprio dominó voa
    s.body.applyImpulse({ x: 0, y: s.body.mass() * 3, z: 0 }, true);
  }

  dispose() {
    this.world.free();
    this.queue.free();
  }
}
