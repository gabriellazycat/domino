import * as THREE from 'three';
import { PIECES } from '../core/pieces';
import { Placed } from '../core/layout';
import { PhaseSpec, ENEMY_RADIUS } from '../core/mapgen';
import { makeDomino, makeEnemy, makeWall, makeLava, makeTrigger, makeHeadRing, dominoGeometry, ghostMaterial, lavaUniforms, glow } from './models';
import { Sim, patrolPos, ENEMY_HEIGHT, quatYaw } from './sim';
import { FaceRig, FaceBase, tiltOfQuat } from './faces';
import type { SweepTarget } from './hand';

// Visual do tabuleiro: cenário da fase, peças do plano (com rosto), inimigos; sincroniza com a física.
interface PieceView { mesh: THREE.Mesh; p: Placed; pop: number; face: FaceRig; simExpr: FaceBase | null }
/** Humor geral das peças: preocupadas no planejamento (olhos correndo), suando antes do disparo, felizes/tristes no resultado. */
export type Mood = 'calm' | 'nervous' | 'happy' | 'sad';
interface EnemyView { pivot: THREE.Group; ring: THREE.Mesh; hpPips?: THREE.Group; bob: number; hitT: number }

export class Board {
  root = new THREE.Group();
  stat = new THREE.Group();
  pieceViews = new Map<number, PieceView>();
  enemyViews: EnemyView[] = [];
  trigger!: THREE.Group;
  heads: THREE.Mesh[] = [];
  ghost: THREE.Mesh;
  trailMeshes: THREE.Mesh[] = [];
  hoverRing: THREE.Mesh;
  spec!: PhaseSpec;
  t = 0;
  mood: Mood = 'calm';
  /** objetos surgindo na fase nova (cai do alto com quique, em onda da esquerda p/ direita) */
  private spawning: { o: THREE.Object3D; delay: number; pos: THREE.Vector3; scale: THREE.Vector3 }[] = [];
  private spawnT = 0;

  constructor(public scene: THREE.Scene) {
    scene.add(this.root);
    this.root.add(this.stat);
    this.ghost = new THREE.Mesh(dominoGeometry('common', 0, 0), ghostMaterial(false));
    this.ghost.visible = false;
    scene.add(this.ghost);
    this.hoverRing = makeHeadRing();
    (this.hoverRing.material as THREE.MeshBasicMaterial).color.set(new THREE.Color('#ffffff').multiplyScalar(2));
    this.hoverRing.scale.setScalar(1.6);
    this.hoverRing.visible = false;
    scene.add(this.hoverRing);
  }

  build(spec: PhaseSpec) {
    this.spec = spec;
    this.clearAll();
    for (const w of spec.walls) this.stat.add(makeWall(w));
    for (const l of spec.lava) {
      const m = makeLava(l.r);
      m.position.set(l.x, 0, l.z);
      m.userData.sweep = 'fade';
      this.stat.add(m);
    }
    this.trigger = makeTrigger();
    this.trigger.position.set(spec.trigger.x, 0, spec.trigger.z);
    this.trigger.rotation.y = spec.trigger.yaw;
    this.stat.add(this.trigger);
    // patrulhas: trilha pontilhada âmbar
    for (const e of spec.enemies) {
      if (!e.patrol) continue;
      const pts = e.patrol.pts;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        const L = Math.hypot(b.x - a.x, b.z - a.z);
        const n = Math.floor(L / 0.22);
        for (let k = 0; k < n; k++) {
          const t = (k + 0.5) / n;
          const dot = new THREE.Mesh(new THREE.CircleGeometry(0.035, 10), glow('#f2a93a', 1.4));
          dot.rotation.x = -Math.PI / 2;
          dot.position.set(a.x + (b.x - a.x) * t, 0.012, a.z + (b.z - a.z) * t);
          dot.userData.sweep = 'fade';
          this.stat.add(dot);
        }
      }
    }
    for (const e of spec.enemies) {
      const pivot = makeEnemy(e.kind);
      const ring = new THREE.Mesh(new THREE.RingGeometry(ENEMY_RADIUS[e.kind] + 0.03, ENEMY_RADIUS[e.kind] + 0.08, 32),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(e.patrol ? '#f2a93a' : '#ff5a4a').multiplyScalar(1.6), transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false }));
      ring.rotation.x = -Math.PI / 2;
      this.root.add(pivot);
      this.root.add(ring);
      const v: EnemyView = { pivot, ring, bob: Math.random() * 6, hitT: -1 };
      if (e.kind === 'brute' || e.kind === 'general') {
        v.hpPips = new THREE.Group();
        this.root.add(v.hpPips);
      }
      this.enemyViews.push(v);
    }
    this.resetEnemies(0);
  }

  setHp(i: number, hp: number, max: number) {
    const v = this.enemyViews[i];
    if (!v.hpPips) return;
    v.hpPips.clear();
    for (let k = 0; k < max; k++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), glow(k < hp ? '#ff5a4a' : '#3a2020', k < hp ? 2.5 : 1));
      m.position.set((k - (max - 1) / 2) * 0.13, 0, 0);
      v.hpPips.add(m);
    }
  }

  /** Inimigos na pose de planejamento (patrulha anda como vitrine). */
  resetEnemies(patrolT: number) {
    this.spec.enemies.forEach((e, i) => {
      const v = this.enemyViews[i];
      const h = ENEMY_HEIGHT[e.kind];
      let x = e.x, z = e.z, yaw = e.yaw;
      if (e.patrol) { const p = patrolPos(e.patrol.pts, patrolT * e.patrol.speed); x = p.x; z = p.z; yaw = p.yaw; }
      v.pivot.position.set(x, h / 2, z);
      v.pivot.quaternion.set(0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2));
      v.pivot.visible = true;
      v.pivot.scale.setScalar(1);
      v.ring.visible = true;
      v.ring.position.set(x, 0.015, z);
      v.hitT = -1;
      if (v.hpPips) { v.hpPips.visible = true; this.setHp(i, e.kind === 'general' ? 4 : 2, e.kind === 'general' ? 4 : 2); }
    });
  }

  addPiece(p: Placed, animate = true) {
    const mesh = makeDomino(p.type, p.id);
    const d = PIECES[p.type];
    mesh.position.set(p.x, d.h / 2, p.z);
    mesh.rotation.set(0, p.yaw, 0);
    if (animate) mesh.scale.setScalar(0.01);
    const face = new FaceRig(p.type);
    if (animate) face.startle(); // acabou de ser posta na mesa: leva um susto
    mesh.add(face.mesh);
    this.root.add(mesh);
    this.pieceViews.set(p.id, { mesh, p, pop: animate ? 0 : 1, face, simExpr: null });
  }

  removePiece(id: number) {
    const v = this.pieceViews.get(id);
    if (!v) return;
    this.root.remove(v.mesh);
    this.pieceViews.delete(id);
  }

  clearPieces() {
    for (const v of this.pieceViews.values()) this.root.remove(v.mesh);
    this.pieceViews.clear();
  }

  /** Volta peças à pose planejada (depois de uma tentativa). */
  resetPieces() {
    for (const v of this.pieceViews.values()) {
      const d = PIECES[v.p.type];
      v.mesh.position.set(v.p.x, d.h / 2, v.p.z);
      v.mesh.quaternion.setFromEuler(new THREE.Euler(0, v.p.yaw, 0));
      v.mesh.visible = true;
      v.mesh.scale.setScalar(1);
      v.pop = 1;
      v.simExpr = null;
    }
  }

  setHeads(heads: Placed[], showTrigger: boolean) {
    while (this.heads.length < heads.length) {
      const r = makeHeadRing();
      this.scene.add(r);
      this.heads.push(r);
    }
    this.heads.forEach((r, i) => {
      const h = heads[i];
      r.visible = !!h;
      if (h) {
        const f = PIECES[h.type].step * 0.55;
        r.position.set(h.x + Math.sin(h.yaw) * f, 0.02, h.z + Math.cos(h.yaw) * f);
      }
    });
    const ring = this.trigger?.getObjectByName('ring');
    const arrow = this.trigger?.getObjectByName('arrow');
    if (ring) ring.visible = showTrigger;
    if (arrow) arrow.visible = showTrigger;
  }

  hideHeads() { for (const r of this.heads) r.visible = false; }

  /** Trilha fantasma: peças que seriam colocadas se o clique fosse agora (ainda não existem no layout). */
  setTrail(list: Placed[]) {
    while (this.trailMeshes.length < list.length) {
      const m = new THREE.Mesh(dominoGeometry('common', 0, 0), ghostMaterial(true));
      m.renderOrder = 2;
      this.trailMeshes.push(m);
      this.scene.add(m);
    }
    this.trailMeshes.forEach((m, i) => {
      const p = list[i];
      m.visible = !!p;
      if (!p) return;
      m.geometry = dominoGeometry(p.type, 0, 0);
      m.position.set(p.x, PIECES[p.type].h / 2, p.z);
      m.rotation.set(0, p.yaw, 0);
    });
  }

  showGhost(g: { x: number; z: number; yaw: number } | null, type: keyof typeof PIECES = 'common') {
    if (!g) { this.ghost.visible = false; return; }
    this.ghost.geometry = dominoGeometry(type, 0, 0);
    this.ghost.visible = true;
    this.ghost.position.set(g.x, PIECES[type].h / 2, g.z);
    this.ghost.rotation.set(0, g.yaw, 0);
  }

  /** Copia a física para os meshes e decide a cara de cada peça (medo → grito → tontura). */
  syncSim(sim: Sim) {
    const near: { x: number; z: number }[] = [];
    for (let i = sim.recentFalls.length - 1; i >= 0 && sim.t - sim.recentFalls[i].t < 0.9; i--) near.push(sim.recentFalls[i]);
    sim.pieces.forEach((s) => {
      const v = this.pieceViews.get(s.p.id);
      if (!v) return;
      const t = s.body.translation(), q = s.body.rotation();
      v.mesh.position.set(t.x, t.y, t.z);
      v.mesh.quaternion.set(q.x, q.y, q.z, q.w);
      if (s.exploded) v.mesh.visible = false;
      const tilt = tiltOfQuat(q);
      let ex: FaceBase;
      if (tilt > 1.15) {
        const w = s.body.angvel();
        ex = Math.abs(w.x) + Math.abs(w.y) + Math.abs(w.z) < 1.5 ? 'dizzy' : 'scream';
      } else if (tilt > 0.16 || s.launched >= 0) ex = 'scream';
      else if (near.some((f) => (f.x - t.x) ** 2 + (f.z - t.z) ** 2 < 0.8)) ex = 'scared';
      else ex = 'worried';
      v.simExpr = ex;
    });
    sim.enemies.forEach((e, i) => {
      const v = this.enemyViews[i];
      const t = e.body.translation(), q = e.body.rotation();
      v.pivot.position.set(t.x, t.y, t.z);
      v.pivot.quaternion.set(q.x, q.y, q.z, q.w);
      v.ring.position.set(t.x, 0.015, t.z);
      v.ring.visible = e.alive;
      if (v.hpPips) v.hpPips.visible = e.alive;
      // some num "puf" depois de cair
      if (!e.alive && sim.t - e.knockedAt > 1.6) {
        const k = Math.max(0, 1 - (sim.t - e.knockedAt - 1.6) / 0.35);
        v.pivot.scale.setScalar(k);
        if (k <= 0) v.pivot.visible = false;
      }
    });
  }

  enemyHit(i: number) { this.enemyViews[i].hitT = this.t; }

  /** Tudo que a mão vai varrer (peças, inimigos, cenário). Marcadores de UI somem na hora. */
  sweepTargets(): SweepTarget[] {
    const out: SweepTarget[] = [];
    for (const v of this.pieceViews.values()) { out.push({ o: v.mesh, kind: 'fly' }); v.simExpr = 'scream'; }
    for (const v of this.enemyViews) {
      out.push({ o: v.pivot, kind: 'fly' }, { o: v.ring, kind: 'fade' });
      if (v.hpPips) out.push({ o: v.hpPips, kind: 'fade' });
    }
    for (const c of this.stat.children) out.push({ o: c, kind: c.userData.sweep === 'fade' ? 'fade' : 'fly' });
    this.hideHeads();
    this.setTrail([]);
    this.showGhost(null);
    this.hoverRing.visible = false;
    return out;
  }

  /** A fase recém-montada surge: cenário e inimigos caem do alto com quique, em onda. */
  spawnIn() {
    this.spawning = [];
    this.spawnT = 0;
    const add = (o: THREE.Object3D, delay: number) => {
      this.spawning.push({ o, delay, pos: o.position.clone(), scale: o.scale.clone() });
      o.scale.setScalar(0.0001);
    };
    const wave = (x: number) => ((x + 8) / 16) * 0.45 + Math.random() * 0.06;
    for (const o of this.stat.children) add(o, 0.05 + wave(o.position.x));
    for (const v of this.enemyViews) {
      const body = v.pivot.children[0];
      if (body) add(body, 0.3 + wave(v.pivot.position.x));
      add(v.ring, 0.3 + wave(v.pivot.position.x));
    }
  }

  /** Anima a fase surgindo (chamado pelo jogo com tempo real). */
  updateSpawn(dt: number) {
    if (!this.spawning.length) return;
    this.spawnT += dt;
    let done = true;
    for (const s of this.spawning) {
      const k = THREE.MathUtils.clamp((this.spawnT - s.delay) / 0.5, 0, 1);
      if (k < 1) done = false;
      // easeOutBack: passa um pouco do tamanho e volta (quique)
      const c = 2.2, e = 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2);
      s.o.scale.copy(s.scale).multiplyScalar(Math.max(0.0001, k <= 0 ? 0 : e));
      s.o.position.set(s.pos.x, s.pos.y + Math.pow(1 - k, 3) * 1.4, s.pos.z);
    }
    if (done) this.spawning = [];
  }

  update(dt: number, planning: boolean, patrolT: number) {
    this.t += dt;
    lavaUniforms.uTime.value = this.t;
    // pop das peças novas (mola) + rosto
    for (const v of this.pieceViews.values()) {
      const se = v.simExpr;
      let ex: FaceBase;
      if (se === 'dizzy' || se === 'scream') ex = se;
      else if (this.mood === 'happy') ex = 'happy';
      else if (this.mood === 'sad') ex = 'sad';
      else if (se) ex = se;
      else ex = this.mood === 'nervous' ? 'nervous' : 'worried';
      v.face.base = ex;
      v.face.update(dt);
      if (v.pop < 1) {
        v.pop = Math.min(1, v.pop + dt * 5);
        const x = v.pop;
        const s = 1 + Math.sin(x * Math.PI * 1.5) * (1 - x) * 0.5;
        v.mesh.scale.setScalar(Math.max(0.01, x < 0.35 ? x / 0.35 : s));
      }
    }
    // gatilho pulsando
    if (this.trigger) {
      const ring = this.trigger.getObjectByName('ring');
      if (ring) ring.scale.setScalar(1 + Math.sin(this.t * 4) * 0.06);
      const cloth = this.trigger.getObjectByName('cloth');
      if (cloth) cloth.rotation.y = Math.sin(this.t * 3.1) * 0.25;
    }
    for (const r of this.heads) if (r.visible) {
      r.scale.setScalar(1 + Math.sin(this.t * 5) * 0.12);
      (r.material as THREE.MeshBasicMaterial).opacity = 0.65 + Math.sin(this.t * 5) * 0.3;
    }
    if (planning && this.spec) {
      this.spec.enemies.forEach((e, i) => {
        const v = this.enemyViews[i];
        const h = ENEMY_HEIGHT[e.kind];
        if (e.patrol) {
          const p = patrolPos(e.patrol.pts, patrolT * e.patrol.speed);
          v.pivot.position.set(p.x, h / 2 + Math.abs(Math.sin(this.t * 8)) * 0.03, p.z);
          const q = quatYaw(p.yaw);
          v.pivot.quaternion.set(q.x, q.y, q.z, q.w);
          v.ring.position.set(p.x, 0.015, p.z);
        } else {
          // respiração idle
          v.pivot.scale.set(1, 1 + Math.sin(this.t * 2.2 + v.bob) * 0.02, 1);
        }
        if (v.hpPips) v.hpPips.position.set(v.pivot.position.x, h + 0.25, v.pivot.position.z);
      });
    }
    // tremidinha de quem levou golpe sem cair (brutamontes)
    this.enemyViews.forEach((v) => {
      if (v.hitT >= 0 && this.t - v.hitT < 0.4) {
        const k = 1 - (this.t - v.hitT) / 0.4;
        v.pivot.scale.set(1 + 0.15 * k, 1 - 0.12 * k, 1 + 0.15 * k);
      }
      if (v.hpPips && !planning) {
        v.hpPips.position.set(v.pivot.position.x, v.pivot.position.y + 0.85, v.pivot.position.z);
      }
    });
    if (this.ghost.visible) (this.ghost.material as THREE.MeshBasicMaterial).opacity = 0.35 + Math.sin(this.t * 10) * 0.12;
    if (this.trailMeshes.length && this.trailMeshes[0].visible) {
      const k = 0.4 + Math.sin(this.t * 6) * 0.1;
      for (const m of this.trailMeshes) if (m.visible) (m.material as THREE.MeshBasicMaterial).opacity = k;
    }
  }

  private clearAll() {
    this.spawning = [];
    this.clearPieces();
    this.stat.clear();
    for (const v of this.enemyViews) { this.root.remove(v.pivot, v.ring); if (v.hpPips) this.root.remove(v.hpPips); }
    this.enemyViews = [];
    this.hideHeads();
  }
}
