import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { BOARD } from '../core/mapgen';

// A mão de porcelana do "dono da mesa": entre uma fase e outra ela desce do escuro, pousa na borda esquerda e
// varre o tabuleiro inteiro (o antebraço deitado cobre toda a profundidade da mesa). Tudo que ela
// alcança voa pela borda; depois ela sobe e some, e a fase nova surge. Animação cinemática simples
// (sem Rapier): cada objeto vira um "destroço" com velocidade, giro e gravidade.

export type SweepKind = 'fly' | 'fade';
export interface SweepTarget { o: THREE.Object3D; kind: SweepKind }

interface Debris {
  o: THREE.Object3D; kind: SweepKind; hit: boolean; half: number;
  v: THREE.Vector3; w: THREE.Vector3; baseY: number; fade: number; scale0: THREE.Vector3;
}

const TABLE_X = BOARD.w / 2 + 3.25, TABLE_Z = BOARD.d / 2 + 2.5;
/** escala da mão inteira (modelada em ~1 unidade = 1 m, mas ela é gigante) */
const S = 1.5;
const WRIST_Z = -0.6;
const Y_SWEEP = 0.56 * S;
const T_IN = 0.8, T_SWEEP = 1.85, T_CLEAR = 2.1, T_OUT = 2.7;
const X_START = -12.4, X_END = 12.6;

const easeOut = (k: number) => 1 - Math.pow(1 - k, 3);
const easeIn = (k: number) => k * k * k;
const easeInOut = (k: number) => 0.5 - 0.5 * Math.cos(Math.PI * k);

export class Hand {
  root = new THREE.Group();
  /** posição da palma no mundo (os olhos do fundo acompanham) */
  palm = new THREE.Vector3();
  onLand: (() => void) | null = null;
  onSweep: (() => void) | null = null;
  private fingers: THREE.Group[][] = [];
  private debris: Debris[] = [];
  private t = -1;
  private landed = false;
  private swept = false;
  private cleared = false;
  private onCleared: (() => void) | null = null;
  private lastX = X_START;

  constructor(scene: THREE.Scene) {
    this.build();
    this.root.scale.setScalar(S);
    this.root.visible = false;
    scene.add(this.root);
  }

  get active() { return this.t >= 0; }

  private build() {
    // porcelana (combina com a máscara do dono da mesa): branco brilhante + juntas esféricas de boneca
    const skin = new THREE.MeshPhysicalMaterial({ color: '#d9d3c6', roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.2 });
    const knuckle = new THREE.MeshPhysicalMaterial({ color: '#9a9488', roughness: 0.35, clearcoat: 0.6 });
    const nail = new THREE.MeshPhysicalMaterial({ color: '#c4bcab', roughness: 0.25, clearcoat: 1 });
    const cloth = new THREE.MeshStandardMaterial({ color: '#15100d', roughness: 0.95, side: THREE.DoubleSide });
    const add = (m: THREE.Mesh, parent: THREE.Object3D) => { m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };

    // palma (achatada) + nós dos dedos
    add(new THREE.Mesh(new RoundedBoxGeometry(2.0, 0.5, 2.3, 4, 0.22), skin), this.root).position.set(0, 0, 0.1);
    for (const x of [-0.72, -0.24, 0.24, 0.7]) add(new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), knuckle), this.root).position.set(x, 0.14, 1.12);
    // dedos compridos (3 falanges articuladas)
    const F = [
      { x: -0.72, len: [0.95, 0.72, 0.52], r: 0.16 },
      { x: -0.24, len: [1.12, 0.82, 0.56], r: 0.17 },
      { x: 0.24, len: [1.06, 0.78, 0.55], r: 0.17 },
      { x: 0.7, len: [0.82, 0.6, 0.45], r: 0.14 },
    ];
    for (const f of F) {
      const segs: THREE.Group[] = [];
      let parent: THREE.Object3D = this.root;
      f.len.forEach((len, i) => {
        const seg = new THREE.Group();
        if (i === 0) seg.position.set(f.x, 0, 1.15); else seg.position.set(0, 0, f.len[i - 1]);
        const r = f.r * (1 - i * 0.12);
        // falange um pouco mais fina que a junta, para a esfera da junta aparecer (boneca)
        const bone = add(new THREE.Mesh(new THREE.CapsuleGeometry(r * 0.88, len - r * 0.4, 4, 10), skin), seg);
        bone.rotation.x = Math.PI / 2;
        bone.position.z = len / 2;
        if (i > 0) add(new THREE.Mesh(new THREE.SphereGeometry(r * 1.02, 12, 10), knuckle), seg);
        if (i === f.len.length - 1) {
          const n = add(new THREE.Mesh(new RoundedBoxGeometry(r * 1.5, 0.06, r * 2.2, 2, 0.025), nail), seg);
          n.position.set(0, r * 0.7, len + r * 0.3);
          n.rotation.x = 0.25;
        }
        parent.add(seg);
        segs.push(seg);
        parent = seg;
      });
      this.fingers.push(segs);
    }
    // polegar (lado de trás da varredura)
    const thumb: THREE.Group[] = [];
    let tp: THREE.Object3D = this.root;
    [0.75, 0.55].forEach((len, i) => {
      const seg = new THREE.Group();
      if (i === 0) { seg.position.set(-1.0, -0.05, 0.4); seg.rotation.y = -0.85; } else seg.position.set(0, 0, 0.75);
      const bone = add(new THREE.Mesh(new THREE.CapsuleGeometry(0.19 - i * 0.03, len, 4, 10), skin), seg);
      bone.rotation.x = Math.PI / 2;
      bone.position.z = len / 2;
      if (i === 1) {
        const n = add(new THREE.Mesh(new RoundedBoxGeometry(0.24, 0.06, 0.34, 2, 0.025), nail), seg);
        n.position.set(0, 0.12, len + 0.05);
      }
      tp.add(seg);
      thumb.push(seg);
      tp = seg;
    });
    this.fingers.push(thumb);
    // pulso = junta esférica de boneca + antebraço comprido deitado na mesa (cobre a profundidade inteira do tabuleiro)
    const wrist = add(new THREE.Mesh(new THREE.SphereGeometry(0.62, 20, 14), knuckle), this.root);
    wrist.position.set(0, 0, -1.05);
    wrist.scale.set(1, 0.7, 0.8);
    const FORE = 9.6;
    const fore = add(new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.88, FORE, 20), skin), this.root);
    fore.rotation.x = Math.PI / 2;
    fore.position.z = -1.45 - FORE / 2;
    // manga rasgada
    const SLEEVE = 6.2;
    const sleeve = add(new THREE.Mesh(new THREE.CylinderGeometry(1.06, 1.18, SLEEVE, 20, 1, true), cloth), this.root);
    sleeve.rotation.x = Math.PI / 2;
    sleeve.position.z = -4.4 - SLEEVE / 2;
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const len = 0.35 + ((i * 7) % 5) * 0.13;
      const strip = add(new THREE.Mesh(new THREE.PlaneGeometry(0.42, len), cloth), this.root);
      strip.position.set(Math.cos(a) * 1.08, Math.sin(a) * 1.08, -4.4 + len / 2 - 0.05);
      strip.rotation.set(-Math.PI / 2, 0, a - Math.PI / 2, 'ZYX');
    }
    // braço de cima subindo para o escuro
    const elbow = new THREE.Group();
    elbow.position.z = -1.0 - FORE;
    elbow.rotation.x = 0.95;
    const upper = add(new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.35, 12, 18, 1, true), cloth), elbow);
    upper.rotation.x = Math.PI / 2;
    upper.position.z = -6;
    add(new THREE.Mesh(new THREE.SphereGeometry(1.25, 16, 12), cloth), elbow);
    this.root.add(elbow);
  }

  /** Começa a cena: varre `targets` e chama `onCleared` quando o tabuleiro está limpo (a mão ainda está saindo). */
  start(targets: SweepTarget[], onCleared: () => void) {
    this.debris = targets.filter((t) => t.o.visible).map(({ o, kind }) => {
      const box = new THREE.Box3().setFromObject(o);
      return {
        o, kind, hit: false, half: box.isEmpty() ? 0.2 : (box.max.x - box.min.x) / 2,
        v: new THREE.Vector3(), w: new THREE.Vector3(), baseY: o.position.y, fade: 1, scale0: o.scale.clone(),
      };
    });
    this.onCleared = onCleared;
    this.t = 0;
    this.landed = this.swept = this.cleared = false;
    this.lastX = X_START;
    this.root.visible = true;
    this.pose(0, 0);
  }

  /** Interrompe sem montar nada (saiu para o menu). */
  cancel() {
    this.onCleared = null;
    this.cleared = true;
    this.debris = [];
    this.t = -1;
    this.root.visible = false;
  }

  /** Pula a cena: some com tudo e já monta a fase nova. */
  skip() {
    if (!this.active) return;
    for (const d of this.debris) d.o.visible = false;
    this.debris = [];
    this.finishClear();
    this.t = -1;
    this.root.visible = false;
  }

  private finishClear() {
    if (this.cleared) return;
    this.cleared = true;
    const cb = this.onCleared;
    this.onCleared = null;
    cb?.();
  }

  private pose(t: number, time: number) {
    const r = this.root;
    let curl = 0.1, spread = 0;
    if (t < T_IN) {
      // desce do alto-esquerda, dedos abertos em garra
      const k = easeOut(t / T_IN);
      // sai do escuro atrás da mesa, ao lado da máscara do dono (MASK_POS), e vem para a borda esquerda
      r.position.set(THREE.MathUtils.lerp(-4.5, X_START, k), THREE.MathUtils.lerp(6, Y_SWEEP, k), THREE.MathUtils.lerp(-11, WRIST_Z, k));
      r.rotation.set(0.05 + (1 - k) * 0.5, (1 - k) * 0.4, (1 - k) * 0.7);
      curl = 0.7 - 0.45 * k; spread = 1 - k * 0.7;
    } else if (t < T_SWEEP) {
      const k = easeInOut((t - T_IN) / (T_SWEEP - T_IN));
      r.position.set(THREE.MathUtils.lerp(X_START, X_END, k), Y_SWEEP + Math.sin(k * Math.PI) * 0.1, WRIST_Z + Math.sin(k * Math.PI * 2) * 0.2);
      r.rotation.set(0.05, Math.sin(k * Math.PI) * -0.08, -0.2 * Math.sin(k * Math.PI));
      curl = 0.25 + Math.sin(k * Math.PI) * 0.12; spread = 0.3;
    } else {
      // sobe e some para o alto-direita, fechando a mão
      const k = easeIn(Math.min(1, (t - T_SWEEP) / (T_OUT - T_SWEEP)));
      // volta para trás da mesa, para perto do dono
      r.position.set(THREE.MathUtils.lerp(X_END, 4.5, k), THREE.MathUtils.lerp(Y_SWEEP, 6, k), THREE.MathUtils.lerp(WRIST_Z, -11, k));
      r.rotation.set(0.05 + k * 0.5, -k * 0.3, -k * 0.5);
      curl = 0.25 + k * 0.7; spread = 0.3;
    }
    // dedos: curvam (cada um um pouco diferente) e tremem um pouco (vivos)
    this.fingers.forEach((segs, fi) => {
      segs.forEach((s, si) => {
        const twitch = Math.sin(time * 7 + fi * 1.7 + si) * 0.05;
        s.rotation.x = curl * (si === 0 ? 0.5 : 1.1) * (1 + (fi % 2) * 0.25) + twitch;
        if (si === 0 && fi < 4) s.rotation.y = (fi - 1.5) * 0.14 * spread;
      });
    });
    r.updateMatrixWorld();
    r.getWorldPosition(this.palm);
  }

  update(dt: number) {
    if (!this.active) return;
    this.t += dt;
    const t = this.t;
    this.pose(t, t);
    if (!this.landed && t >= T_IN) { this.landed = true; this.onLand?.(); }
    if (!this.swept && t >= T_IN + 0.05) { this.swept = true; this.onSweep?.(); }
    // borda da mão empurra o que estiver à frente (o antebraço cobre todo o Z da mesa)
    const x = this.root.position.x;
    const speed = Math.max(4, (x - this.lastX) / Math.max(dt, 1e-3));
    this.lastX = x;
    const sweeping = t >= T_IN && t < T_SWEEP;
    for (const d of this.debris) {
      const o = d.o;
      if (!d.hit && sweeping && o.position.x - d.half < x + 1.15 * S) {
        d.hit = true;
        const heavy = d.half > 0.6;
        d.v.set(speed * (1.05 + Math.random() * 0.35), (heavy ? 1 : 2) + Math.random() * (heavy ? 1.5 : 3.5), (Math.random() - 0.5) * 1.6);
        const sp = heavy ? 3 : 9;
        d.w.set((Math.random() - 0.5) * sp, (Math.random() - 0.5) * sp, -(2 + Math.random() * sp));
      }
      if (!d.hit || !o.visible) continue;
      if (d.kind === 'fade') {
        d.fade = Math.max(0, d.fade - dt * 4);
        o.scale.copy(d.scale0).multiplyScalar(d.fade);
        if (d.fade <= 0) o.visible = false;
        continue;
      }
      d.v.y -= 16 * dt;
      o.position.addScaledVector(d.v, dt);
      o.rotation.x += d.w.x * dt; o.rotation.y += d.w.y * dt; o.rotation.z += d.w.z * dt;
      const onTable = Math.abs(o.position.x) < TABLE_X && Math.abs(o.position.z) < TABLE_Z;
      if (onTable && o.position.y < d.baseY) { o.position.y = d.baseY; d.v.y = Math.abs(d.v.y) * 0.3; d.v.x *= 0.92; }
      if (o.position.y < -14) o.visible = false;
    }
    if (t >= T_CLEAR) this.finishClear();
    if (t >= T_OUT) { this.t = -1; this.root.visible = false; this.debris = []; }
  }
}
