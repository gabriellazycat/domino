import RAPIER from '@dimforge/rapier3d-compat';
import { PIECES } from '../core/pieces';
import { Placed } from '../core/layout';
import { EnemySpec, ENEMY_HP, ENEMY_RADIUS, PhaseSpec, BOARD, Vec2, GateSpec, ARCHER_RANGE } from '../core/mapgen';
import { jumps, runnerPath, alongPath, RunPath, RUNNER_SPEED, JUMP_TIME, JUMP_APEX, jumpLanding } from '../core/motion';

// Simulação física (Rapier). Mesma física para o jogo ao vivo e para o bot/testes headless.
// Assistência "encostou, derruba" (herdada do Topple Unity): peça em pé tocada por corpo dinâmico
// recebe um giro para onde APONTA — a física anima a queda, a corrente nunca morre por raspão.

export const ENEMY_HEIGHT: Record<string, number> = { soldier: 0.9, patroller: 0.9, torcher: 0.9, brute: 1.15, general: 1.35, ogre: 1.5, archer: 0.9 };
const ENEMY_DENSITY: Record<string, number> = { soldier: 8, patroller: 8, torcher: 8, brute: 20, general: 22, ogre: 24, archer: 8 };
/** Porteira: quanto tempo a grade leva para afundar e para subir de novo. */
export const GATE_LOWER = 0.25;
export const GATE_RAISE = 0.4;
/** Ogro derrubado: tomba como dominó gigante e esmaga quem estiver nesta faixa à frente dele. */
export const OGRE_REACH = 1.9;
/** quanto tempo a peça queimada leva para virar cinza e sumir (só visual; a física some na hora) */
export const BURN_TIME = 0.9;
export const BLAST_RADIUS = 1.7;
const GRAVITY = -11;
const DT = 1 / 120;
const KICK = 4.6; // rad/s para peça de 0,8 m
const STANDING = (25 * Math.PI) / 180;
const FALLEN = (50 * Math.PI) / 180;
const SPLASH_R = 0.85;

export type Cause = 'piece' | 'heavy' | 'blast' | 'body' | 'splash' | 'runner';
type Owner = { kind: 'piece' | 'enemy'; i: number; v: number };

export interface SimEvents {
  pieceFall?(i: number, x: number, y: number, z: number, chain: number): void;
  pieceTouch?(i: number): void;
  enemyHit?(e: SimEnemy, hpLeft: number): void;
  enemyKnock?(e: SimEnemy, cause: Cause, combo: number): void;
  explosion?(x: number, y: number, z: number, r: number): void;
  bulldoze?(x: number, z: number): void;
  /** Tocheiro encostou a tocha numa peça em pé: ela pega fogo e some. */
  burn?(i: number, x: number, z: number): void;
  runner?(i: number): void;
  /** A Saltadora (ou peça com Mola) saiu do chão. */
  jump?(i: number): void;
  /** Foguete parou / Saltadora pousou. */
  land?(i: number, x: number, z: number, kind: 'run' | 'jump'): void;
  /** O Arqueiro gastou a flecha na peça `i`. */
  arrow?(e: SimEnemy, i: number, x: number, z: number): void;
  /** O Ogro pisou numa peça em pé: ela some (a corrente quebra ali). */
  crush?(i: number, x: number, z: number): void;
  /** O Ogro derrubado bateu no chão (esmagou a faixa à frente). */
  ogreSlam?(e: SimEnemy, x: number, z: number, dx: number, dz: number): void;
  /** A corrente derrubou a alavanca da porteira `g`. */
  lever?(g: number): void;
  allDown?(): void;
  /** Impacto real entre dois corpos (velocidade antes do contato): dá o volume e o timbre do som. */
  impact?(speed: number, x: number, y: number, z: number, material: 'wood' | 'metal' | 'toy'): void;
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
  burned: number; // t em que o tocheiro queimou a peça (-1 = não)
  crushed: number; // t em que o Ogro pisou na peça (-1 = não)
  /** derrubada pela corrente (chute de assistência): a Torre ganha queda guiada */
  guided?: boolean;
  /** corrida do Foguete / salto em andamento (corpo cinemático seguindo o roteiro) */
  motion: Motion | null;
}

type Motion =
  | { kind: 'run'; t0: number; dur: number; path: RunPath }
  | { kind: 'jump'; t0: number; dur: number; from: Vec2; to: Vec2; yaw: number };

export interface SimEnemy {
  idx: number;
  spec: EnemySpec;
  body: RAPIER.RigidBody;
  hp: number;
  alive: boolean;
  knockedAt: number;
  hitBy: Set<number>;
  lastHit: number;
  /** Arqueiro: já atirou a flecha (só tem uma) */
  arrowUsed?: boolean;
}

export interface SimGate {
  spec: GateSpec;
  body: RAPIER.RigidBody;
  /** t em que a alavanca caiu (-1 = fechada desde o começo) */
  openAt: number;
}

/** Quanto a grade está aberta (0 fechada, 1 toda afundada) `u` segundos depois da alavanca. */
export function gateOpenness(g: GateSpec, u: number): number {
  if (u < 0) return 0;
  if (u < GATE_LOWER) return u / GATE_LOWER;
  if (u < GATE_LOWER + g.open) return 1;
  return Math.max(0, 1 - (u - GATE_LOWER - g.open) / GATE_RAISE);
}

/**
 * Dano de uma peça num inimigo com vida (Brutamontes 2, General 4):
 * Pesada tira 4 (derruba qualquer um), Torre 3 (esmaga Brutamontes), o resto 1.
 * A Explosiva derruba todo mundo no raio direto (equivale a 4) — ver `explode`.
 */
export function pieceDamage(type: string): number {
  return type === 'heavy' ? 4 : type === 'tower' ? 3 : 1;
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
  gates: SimGate[] = [];
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
  /** collider → corpo; `v` = velocidade linear antes do passo (para medir o impacto). */
  private owner = new Map<number, { kind: 'piece' | 'enemy'; i: number; v: number }>();
  private pendingSplash: { e: SimEnemy; at: number; fx: number; fz: number; src: number }[] = [];
  private pendingBlast: { i: number; at: number }[] = [];
  /** peças que a onda alcança com atraso (o Foguete chegou, a Saltadora pousou) */
  private pendingTouch: { i: number; at: number }[] = [];
  /** id da peça no plano → índices das filhas */
  private childIdx = new Map<number, number[]>();
  /** Ogros caindo: a pancada no chão acontece um instante depois do golpe */
  private pendingSlam: { e: SimEnemy; at: number; x: number; z: number; dx: number; dz: number }[] = [];

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
      const b = this.world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(w.x, w.h / 2, w.z).setRotation(quatYaw(w.yaw ?? 0)));
      this.world.createCollider(RAPIER.ColliderDesc.cuboid(w.w / 2, w.h / 2, w.d / 2).setFriction(0.6), b);
    }
    // porteiras: grade cinemática (afunda no chão quando a alavanca cai)
    for (const g of spec.gates ?? []) {
      const b = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(g.x, g.h / 2, g.z).setRotation(quatYaw(g.yaw ?? 0)));
      this.world.createCollider(RAPIER.ColliderDesc.cuboid(g.w / 2, g.h / 2, g.d / 2).setFriction(0.6), b);
      this.gates.push({ spec: g, body: b, openAt: -1 });
    }

    layout.forEach((p, i) => {
      const d = PIECES[p.type];
      const q = quatYaw(p.yaw);
      const body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic().setTranslation(p.x, d.h / 2 + 0.001, p.z).setRotation(q)
          .setCanSleep(true).setSleeping(true).setCcdEnabled(true).setAngularDamping(0.05));
      const cd = RAPIER.ColliderDesc.cuboid(d.w / 2, d.h / 2, d.t / 2).setFriction(0.6).setRestitution(0.02)
        .setDensity(p.type === 'heavy' ? 14 : 6).setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS);
      // quem corre/salta vira cinemático: precisa sentir também os patrulheiros (cinemáticos)
      if (p.type === 'runner' || jumps(p)) cd.setActiveCollisionTypes(RAPIER.ActiveCollisionTypes.DEFAULT | RAPIER.ActiveCollisionTypes.KINEMATIC_KINEMATIC);
      const col = this.world.createCollider(cd, body);
      this.owner.set(col.handle, { kind: 'piece', i, v: 0 });
      this.pieces.push({ p, body, touched: false, kicked: false, fallen: false, launched: -1, exploded: false, blastArm: -1, burned: -1, crushed: -1, motion: null });
    });
    layout.forEach((p, i) => {
      if (!this.childIdx.has(p.parent)) this.childIdx.set(p.parent, []);
      this.childIdx.get(p.parent)!.push(i);
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
      this.owner.set(col.handle, { kind: 'enemy', i, v: 0 });
      this.enemies.push({ idx: i, spec: e, body, hp: ENEMY_HP[e.kind], alive: true, knockedAt: -1, hitBy: new Set(), lastHit: -9 });
    });
  }

  get alive(): number { return this.enemies.filter((e) => e.alive).length; }

  fire() {
    if (this.fired || !this.pieces.length) return;
    this.fired = true;
    // a raiz (1ª peça colocada) recebe o impulso
    const root = this.pieces.find((s) => s.p.parent === -1) ?? this.pieces[0];
    this.activate(root, this.pieces.indexOf(root));
  }

  /** A onda chegou na peça: tomba (comum), corre (Foguete) ou salta (Saltadora/Mola). */
  private activate(s: SimPiece, i: number) {
    if (s.p.type === 'runner') this.startRun(s, i);
    else if (jumps(s.p)) this.startJump(s, i);
    else this.kickPiece(s, 1.0);
  }

  private startRun(s: SimPiece, i: number) {
    const path = runnerPath(this.spec, s.p.x, s.p.z, s.p.yaw);
    s.kicked = true;
    s.launched = this.t;
    s.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
    s.motion = { kind: 'run', t0: this.t, dur: Math.max(0.02, path.len / RUNNER_SPEED), path };
    this.ev.runner?.(i);
  }

  private startJump(s: SimPiece, i: number) {
    s.kicked = true;
    s.launched = this.t;
    s.body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true);
    s.motion = { kind: 'jump', t0: this.t, dur: JUMP_TIME, from: { x: s.p.x, z: s.p.z }, to: jumpLanding(s.p), yaw: s.p.yaw };
    this.ev.jump?.(i);
  }

  /** Avança corridas e saltos (antes do passo da física). */
  private driveMotions() {
    for (let i = 0; i < this.pieces.length; i++) {
      const s = this.pieces[i];
      const m = s.motion;
      if (!m) continue;
      if (s.burned >= 0 || s.exploded) { s.motion = null; continue; }
      const k = Math.min(1, (this.t - m.t0) / m.dur);
      const h = PIECES[s.p.type].h / 2 + 0.001;
      if (m.kind === 'run') {
        const at = alongPath(m.path.pts, k * m.path.len);
        s.body.setNextKinematicTranslation({ x: at.x, y: h, z: at.z });
        s.body.setNextKinematicRotation(quatYaw(at.yaw));
      } else {
        // arco + uma cambalhota para a frente; o giro fecha aos 75% (desce já em pé, sem varrer a peça do pouso)
        const x = m.from.x + (m.to.x - m.from.x) * k, z = m.from.z + (m.to.z - m.from.z) * k;
        const y = h + 4 * JUMP_APEX * k * (1 - k);
        const r = Math.min(1, k / 0.75);
        const th = Math.PI * 2 * (r * r * (3 - 2 * r));
        const sy = Math.sin(m.yaw / 2), cy = Math.cos(m.yaw / 2), sx = Math.sin(th / 2), cx = Math.cos(th / 2);
        s.body.setNextKinematicTranslation({ x, y, z });
        s.body.setNextKinematicRotation({ x: cy * sx, y: sy * cx, z: -sy * sx, w: cy * cx });
      }
      if (k >= 1) this.endMotion(i, true);
    }
  }

  /** Fim da corrida/salto: volta a ser corpo comum, tomba para a frente e a onda segue para a filha. */
  private endMotion(i: number, reached: boolean) {
    const s = this.pieces[i];
    const m = s.motion;
    if (!m) return;
    s.motion = null;
    s.launched = -2;
    s.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
    s.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.kickPiece(s, 1.0);
    const t = s.body.translation();
    this.ev.land?.(i, t.x, t.z, m.kind);
    if (reached) for (const c of this.childIdx.get(s.p.id) ?? []) this.pendingTouch.push({ i: c, at: this.t + 0.1 });
  }

  private kickPiece(s: SimPiece, mult: number) {
    const q = s.body.rotation();
    const [fx, fz] = facingOf(q);
    const h = PIECES[s.p.type].h;
    const w = KICK * Math.sqrt(0.8 / h) * mult;
    s.body.wakeUp();
    s.body.setAngvel({ x: fz * w, y: 0, z: -fx * w }, true);
    s.kicked = true;
    s.guided = true;
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
    this.driveMotions();
    for (const g of this.gates) {
      if (g.openAt < 0) continue;
      const k = gateOpenness(g.spec, this.t - g.openAt);
      g.body.setNextKinematicTranslation({ x: g.spec.x, y: g.spec.h / 2 - (g.spec.h + 0.03) * k, z: g.spec.z });
    }
    for (const pt of this.pendingTouch.splice(0)) {
      if (this.t >= pt.at) this.pieces[pt.i].touched = true; else this.pendingTouch.push(pt);
    }
    // velocidade de cada corpo antes do passo (o impacto é medido com ela, não com a pós-colisão)
    for (const o of this.owner.values()) {
      const b = o.kind === 'piece' ? this.pieces[o.i].body : this.enemies[o.i].body;
      const v = b.linvel();
      o.v = Math.hypot(v.x, v.y, v.z);
    }
    this.world.step(this.queue);
    this.queue.drainCollisionEvents((h1, h2, started) => {
      if (!started) return;
      const a = this.owner.get(h1), b = this.owner.get(h2);
      if (this.fired && (a || b)) this.emitImpact(a, b);
      if (a) this.onContact(a, b);
      if (b) this.onContact(b, a);
    });

    // peças: chute, queda, explosiva, foguete
    for (let i = 0; i < this.pieces.length; i++) {
      const s = this.pieces[i];
      const q = s.body.rotation();
      const tilt = tiltOf(q);
      if (s.touched && !s.kicked && tilt < STANDING && this.fired) {
        this.activate(s, i);
        this.ev.pieceTouch?.(i);
      }
      // Torre: queda guiada no eixo planejado (alta e fina, um golpe torto a girava e a ponta errava
      // a próxima peça a 1,15 m). Só o giro em torno do eixo de tombo fica; o deslize de lado some.
      if (s.p.type === 'tower' && s.guided && s.launched < 0 && tilt < 1.35 && s.burned < 0 && !s.exploded) {
        const ax = Math.cos(s.p.yaw), az = -Math.sin(s.p.yaw);
        const w = s.body.angvel(), v = s.body.linvel();
        const k = Math.max(0, w.x * ax + w.z * az);
        const vs = v.x * ax + v.z * az;
        s.body.setAngvel({ x: ax * k, y: 0, z: az * k }, true);
        s.body.setLinvel({ x: v.x - ax * vs, y: v.y, z: v.z - az * vs }, true);
      }
      if (!s.fallen && tilt > FALLEN) {
        s.fallen = true;
        this.chain++;
        const tr = s.body.translation();
        this.recentFalls.push({ x: tr.x, z: tr.z, t: this.t });
        this.ev.pieceFall?.(i, tr.x, tr.y, tr.z, this.chain);
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
            const dmg = pieceDamage(s.p.type);
            this.hit(e, i, dmg, tr, dmg > 1 ? 'heavy' : 'piece');
            if (s.p.type === 'blast' && s.blastArm < 0) s.blastArm = this.t + 0.02;
          }
        }
      }
      if (s.blastArm >= 0 && !s.exploded && this.t >= s.blastArm) this.explode(i);
      // caiu da mesa
      if (s.body.translation().y < -3 && !s.fallen) s.fallen = true;
    }
    this.leversAndArrows();
    for (const sl of this.pendingSlam.splice(0)) {
      if (this.t < sl.at) { this.pendingSlam.push(sl); continue; }
      this.ogreSlam(sl);
    }
    for (const pb of this.pendingBlast.splice(0)) {
      if (this.t >= pb.at) this.explode(pb.i); else this.pendingBlast.push(pb);
    }
    for (const sp of this.pendingSplash.splice(0)) {
      if (this.t < sp.at) { this.pendingSplash.push(sp); continue; }
      if (!sp.e.alive) continue;
      // soldado cai junto; brutamontes/general levam 1 de dano por vizinho derrubado
      if (sp.e.spec.kind === 'soldier') this.knock(sp.e, sp.fx, sp.fz, 'splash', 0.8);
      // mesma origem do "corpo arremessado" (1000 + idx): o mesmo vizinho só tira 1 de vida, mesmo se também bater voando
      else this.hit(sp.e, 1000 + sp.src, 1, { x: sp.fx, z: sp.fz }, 'splash');
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
    if (this.pendingBlast.length || this.pendingSplash.length || this.pendingTouch.length || this.pendingSlam.length || this.pieces.some((s) => s.motion)) maxV = 1;
    this.quietFor = maxV < 0.06 ? this.quietFor + DT : 0;
    if (this.fired && this.t > 1.5 && this.quietFor > 1.2) this.finish();
    if (this.t > 28) this.finish();
  }

  /** Emite o impacto do corpo mais rápido do contato (chão e muro contam como velocidade zero). */
  private emitImpact(a: Owner | undefined, b: Owner | undefined) {
    const sa = a?.v ?? 0, sb = b?.v ?? 0;
    const speed = Math.max(sa, sb);
    if (speed < 0.35 || !this.ev.impact) return;
    const m = sa >= sb ? a! : b!;
    const body = m.kind === 'piece' ? this.pieces[m.i].body : this.enemies[m.i].body;
    const t = body.translation();
    const material = m.kind === 'enemy' ? 'toy' : this.pieces[m.i].p.type === 'heavy' ? 'metal' : 'wood';
    this.ev.impact(speed, t.x, t.y, t.z, material);
  }

  private onContact(me: Owner, other: Owner | undefined) {
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
          // patrulheiro empurra peça em pé (estraga o caminho); o tocheiro queima; peça caindo mata os dois
          // (Explosiva encostada na tocha não queima: detona logo abaixo)
          if (!s.kicked && tiltOf(s.body.rotation()) < STANDING) {
            if (e.spec.kind === 'ogre') return this.crush(s, me.i);
            if (e.spec.kind !== 'torcher') this.bulldoze(s, e);
            else if (s.p.type !== 'blast') return this.burn(s, me.i);
          }
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
        // patrulheiro andando sobre peça já caída e parada não morre: só vale contato com a peça em movimento
        if (e.spec.patrol && s.launched < 0) {
          const lv = s.body.linvel(), av = s.body.angvel();
          if (s.body.isSleeping() || Math.hypot(lv.x, lv.y, lv.z) < 0.25 && Math.hypot(av.x, av.y, av.z) < 0.6) return;
        }
        const dmg = pieceDamage(s.p.type);
        this.hit(e, other.i, dmg, s.body.translation(), dmg > 1 ? 'heavy' : s.launched >= 0 ? 'runner' : 'piece');
        // o Foguete trava em quem aguenta o golpe (Brutamontes, Ogro): a corrente morre ali
        if (e.alive && s.motion?.kind === 'run') this.endMotion(other.i, false);
      } else {
        const o = this.enemies[other.i];
        if (o.alive) return;
        const v = o.body.linvel();
        if (Math.hypot(v.x, v.y, v.z) < 1.0) return;
        // outro inimigo arremessado: sempre 1 de vida (pequeno ou grande)
        this.hit(e, 1000 + other.i, 1, o.body.translation(), 'body');
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
    if (e.spec.kind === 'ogre') {
      // o Ogro não voa: tomba como um dominó gigante na direção do golpe e esmaga a faixa à frente
      b.setAngularDamping(0.2);
      b.setLinvel({ x: dx * 0.5, y: 0.3, z: dz * 0.5 }, true);
      b.setAngvel({ x: dz * 3.4, y: 0, z: -dx * 3.4 }, true);
      this.pendingSlam.push({ e, at: this.t + 0.5, x: p.x, z: p.z, dx, dz });
    } else {
      const big = e.spec.kind === 'brute' || e.spec.kind === 'general';
      const sp = (big ? 2.2 : 3.0) * strength;
      b.setLinvel({ x: dx * sp, y: (big ? 2.6 : 3.4) * strength, z: dz * sp }, true);
      b.setAngvel({ x: dz * 9, y: (e.idx % 2 ? 4 : -4), z: -dx * 9 }, true);
    }
    if (this.t - this.lastKnockT <= 1.5) this.combo++; else this.combo = 1;
    this.lastKnockT = this.t;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    this.ev.enemyKnock?.(e, cause, this.combo);
    // pelotão cai junto (respingo em cadeia): vizinho a ≤ SPLASH_R tomba ou leva 1 de dano
    for (const o of this.enemies) {
      if (!o.alive || o === e || o.spec.squad !== e.spec.squad) continue;
      if (o.spec.patrol) continue;
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

  /** O Ogro tombado bate no chão: derruba quem estiver na faixa à frente e acorda as peças em pé ali. */
  private ogreSlam(sl: { e: SimEnemy; x: number; z: number; dx: number; dz: number }) {
    const inLane = (x: number, z: number, r: number) => {
      const rx = x - sl.x, rz = z - sl.z;
      const along = rx * sl.dx + rz * sl.dz, lat = Math.abs(rx * sl.dz - rz * sl.dx);
      return along > 0 && along < OGRE_REACH && lat < 0.4 + r;
    };
    for (const o of this.enemies) {
      if (!o.alive || o === sl.e) continue;
      const p = o.body.translation();
      if (inLane(p.x, p.z, ENEMY_RADIUS[o.spec.kind])) this.knock(o, sl.x, sl.z, 'body', 1.1);
    }
    for (const s of this.pieces) {
      if (s.kicked || s.burned >= 0 || s.crushed >= 0) continue;
      const p = s.body.translation();
      if (inLane(p.x, p.z, 0.2)) s.touched = true;
    }
    this.ev.ogreSlam?.(sl.e, sl.x + sl.dx * OGRE_REACH * 0.6, sl.z + sl.dz * OGRE_REACH * 0.6, sl.dx, sl.dz);
  }

  /** Ogro pisou: a peça em pé é esmagada e sai da física (a corrente quebra ali). */
  private crush(s: SimPiece, i: number) {
    if (s.crushed >= 0 || s.burned >= 0) return;
    s.crushed = this.t;
    s.kicked = true;
    s.touched = false;
    s.body.setEnabled(false);
    const tp = s.body.translation();
    this.ev.crush?.(i, tp.x, tp.z);
  }

  /**
   * Alavancas: uma peça da corrente caindo em cima (ou o Foguete passando) abre a porteira.
   * Arqueiros: a 1ª peça da corrente que se mexe dentro do círculo leva a flecha de fogo (uma vez só);
   * o Foguete correndo é imune.
   */
  private leversAndArrows() {
    if (!this.fired) return;
    this.gates.forEach((g, gi) => {
      if (g.openAt >= 0) return;
      const L = g.spec.lever;
      for (const s of this.pieces) {
        if (!s.kicked || s.burned >= 0 || s.crushed >= 0 || s.exploded) continue;
        const tr = s.body.translation(), q = s.body.rotation();
        const hh = PIECES[s.p.type].h / 2;
        const upx = 2 * (q.x * q.y - q.w * q.z), upy = 1 - 2 * (q.x * q.x + q.z * q.z), upz = 2 * (q.y * q.z + q.w * q.x);
        const tx = tr.x + upx * hh, ty = tr.y + upy * hh, tz = tr.z + upz * hh;
        if (Math.hypot(tr.x - L.x, tr.z - L.z) < 0.32 || (ty < 0.75 && Math.hypot(tx - L.x, tz - L.z) < 0.3)) {
          g.openAt = this.t;
          this.ev.lever?.(gi);
          break;
        }
      }
    });
    for (const e of this.enemies) {
      if (!e.alive || e.spec.kind !== 'archer' || e.arrowUsed) continue;
      const ep = e.body.translation();
      for (let i = 0; i < this.pieces.length; i++) {
        const s = this.pieces[i];
        if (!s.kicked || s.fallen || s.burned >= 0 || s.crushed >= 0 || s.exploded || s.motion?.kind === 'run') continue;
        // dentro do círculo: onde a peça foi COLOCADA (quem está saltando conta onde está agora)
        const tr = s.body.translation();
        const at = s.motion ? tr : s.p;
        if (Math.hypot(at.x - ep.x, at.z - ep.z) > ARCHER_RANGE) continue;
        e.arrowUsed = true;
        this.ev.arrow?.(e, i, tr.x, tr.z);
        // flecha de FOGO: a peça atingida e a seguinte (o fogo pula) — o buraco fica maior que a queda de uma Comum
        this.burn(s, i);
        for (const c of this.childIdx.get(s.p.id) ?? []) {
          const o = this.pieces[c];
          if (!o.kicked && o.burned < 0) this.burn(o, c);
        }
        break;
      }
    }
  }

  /** A peça em pé pega fogo: sai da física na hora (a corrente quebra ali) e o Board a desfaz em cinza. */
  private burn(s: SimPiece, i: number) {
    if (s.burned >= 0) return;
    s.burned = this.t;
    s.kicked = true;
    s.touched = false;
    s.body.setEnabled(false);
    const tp = s.body.translation();
    this.ev.burn?.(i, tp.x, tp.z);
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
      if (d > BLAST_RADIUS || j === i || o.burned >= 0) continue;
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
