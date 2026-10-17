import * as THREE from 'three';
import { BOARD } from '../core/mapgen';
import { wornWoodTextures } from './textures';

// A mão de marionete do "dono da mesa" (boneco ventríloquo): entre uma fase e outra ela desce do escuro
// pendurada nas cordas, pousa na borda esquerda e varre o tabuleiro inteiro (o antebraço deitado cobre
// toda a profundidade da mesa). Tudo que ela alcança voa pela borda; depois ela sobe e some, e a fase nova
// surge. Animação cinemática simples (sem Rapier): cada objeto vira um "destroço" com velocidade, giro e gravidade.

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
  /** pontos onde as cordas se prendem (pontas dos dedos, pulso, cotovelo) e o alto de cada corda (local da mão) */
  private stringEnds: THREE.Object3D[] = [];
  private stringTops: THREE.Vector3[] = [];
  private strings!: THREE.LineSegments;
  private tmp = new THREE.Vector3();

  constructor(scene: THREE.Scene) {
    this.build();
    this.root.scale.setScalar(S);
    this.root.visible = false;
    scene.add(this.root);
  }

  get active() { return this.t >= 0; }

  private build() {
    // madeira crua e velha: veio gasto, lascas arrancadas, pinos de ferro nas juntas e um dedo quebrado
    const { map, bump } = wornWoodTextures();
    const wood = new THREE.MeshStandardMaterial({ map, bumpMap: bump, bumpScale: 2.2, roughness: 0.78, color: '#e8dccb' });
    const fresh = new THREE.MeshStandardMaterial({ color: '#c9a274', roughness: 0.9 }); // madeira exposta da quebra
    const iron = new THREE.MeshStandardMaterial({ color: '#2b2622', roughness: 0.45, metalness: 0.8 });
    const brass = new THREE.MeshStandardMaterial({ color: '#8a6a3a', roughness: 0.35, metalness: 0.85 });
    const cloth = new THREE.MeshStandardMaterial({ color: '#1b1820', roughness: 0.95, side: THREE.DoubleSide });
    const shirt = new THREE.MeshStandardMaterial({ color: '#b9ae96', roughness: 0.85, side: THREE.DoubleSide });
    const add = (m: THREE.Mesh, parent: THREE.Object3D) => { m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
    const pin = (parent: THREE.Object3D, len: number, rad: number, z = 0) => {
      const p = add(new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, len, 10), iron), parent);
      p.rotation.z = Math.PI / 2;
      p.position.z = z;
      return p;
    };
    const anchor = (parent: THREE.Object3D, x: number, y: number, z: number) => {
      const o = new THREE.Object3D();
      o.position.set(x, y, z);
      parent.add(o);
      this.stringEnds.push(o);
    };
    let uvSeed = 0;
    const GAP = 0.07;
    /** falange: bloco entalhado + tambor de dobradiça atravessado por um pino */
    const phalanx = (seg: THREE.Group, r: number, len: number, chips: Chip[]) => {
      const L = len - GAP;
      const bone = add(new THREE.Mesh(carvedBlock(r * 1.9, r * 1.55, L, r * 0.32, [2, 2, 4], chips, 0.25, uvSeed++), wood), seg);
      bone.position.z = GAP / 2 + L / 2;
      const drum = add(new THREE.Mesh(new THREE.CylinderGeometry(r * 0.62, r * 0.62, r * 1.3, 14), wood), seg);
      drum.rotation.z = Math.PI / 2;
      pin(seg, r * 2.15, r * 0.2);
      return GAP / 2 + L;
    };

    // palma entalhada, com duas lascas arrancadas (canto da frente e borda de trás)
    const palm = add(new THREE.Mesh(carvedBlock(2.0, 0.5, 2.3, 0.13, [10, 3, 12], [
      { c: new THREE.Vector3(0.95, 0.25, 1.1), rad: 0.5, depth: 0.2 },
      { c: new THREE.Vector3(-1.0, 0.05, -0.55), rad: 0.36, depth: 0.13 },
    ], 0.4, uvSeed++), wood), this.root);
    palm.position.set(0, 0, 0.1);
    // dedos: falanges separadas por um vão, com um pino em cada junta
    const F = [
      { x: -0.72, len: [0.95, 0.72, 0.52], r: 0.16 },
      { x: -0.24, len: [1.12, 0.82, 0.56], r: 0.17 },
      { x: 0.24, len: [1.06, 0.78, 0.55], r: 0.17 },
      { x: 0.7, len: [0.82, 0.6, 0.45], r: 0.14 },
    ];
    F.forEach((f, fi) => {
      const segs: THREE.Group[] = [];
      let parent: THREE.Object3D = this.root;
      f.len.forEach((len, i) => {
        const seg = new THREE.Group();
        if (i === 0) seg.position.set(f.x, 0, 1.2); else seg.position.set(0, 0, f.len[i - 1]);
        const r = f.r * (1 - i * 0.1);
        const last = i === f.len.length - 1;
        const broken = fi === 3 && last; // o mindinho perdeu a ponta
        const chips: Chip[] = broken ? [{ c: new THREE.Vector3(r * 0.6, r * 0.5, len * 0.22), rad: r * 1.2, depth: r * 0.45 }]
          : fi === 1 && i === 1 ? [{ c: new THREE.Vector3(-r, r * 0.7, 0), rad: r * 0.9, depth: r * 0.3 }] : [];
        const tipZ = phalanx(seg, r, broken ? len * 0.45 : len, chips);
        if (broken) {
          // farpas da quebra: lascas claras espetadas para fora
          for (let k = 0; k < 6; k++) {
            const sp = add(new THREE.Mesh(splinterGeometry(r * (0.16 + (k % 3) * 0.05), r * (0.6 + ((k * 5) % 4) * 0.25), k), fresh), seg);
            const a = (k / 6) * Math.PI * 2;
            sp.position.set(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.45, tipZ - r * 0.1);
            sp.rotation.set(Math.PI / 2 + Math.sin(a) * 0.25, 0, Math.cos(a) * 0.25);
          }
          const scar = add(new THREE.Mesh(new THREE.CircleGeometry(r * 0.72, 9), fresh), seg);
          scar.position.z = tipZ + 0.002;
        } else if (last) anchor(seg, 0, r * 0.75, tipZ * 0.8);
        parent.add(seg);
        segs.push(seg);
        parent = seg;
      });
      this.fingers.push(segs);
    });
    // polegar (lado de trás da varredura)
    const thumb: THREE.Group[] = [];
    let tp: THREE.Object3D = this.root;
    [0.75, 0.55].forEach((len, i) => {
      const seg = new THREE.Group();
      if (i === 0) { seg.position.set(-1.0, -0.05, 0.4); seg.rotation.y = -0.85; } else seg.position.set(0, 0, 0.75);
      const r = 0.19 - i * 0.03;
      const tipZ = phalanx(seg, r, len, []);
      if (i === 1) anchor(seg, 0, r * 0.75, tipZ * 0.8);
      tp.add(seg);
      thumb.push(seg);
      tp = seg;
    });
    this.fingers.push(thumb);
    // pulso: bola de madeira presa por um pino comprido com cabeças de latão
    const wrist = add(new THREE.Mesh(new THREE.SphereGeometry(0.62, 24, 16), wood), this.root);
    wrist.position.set(0, 0, -1.05);
    wrist.scale.set(1, 0.7, 0.8);
    pin(this.root, 1.5, 0.08, -1.05);
    for (const sx of [-1, 1]) {
      const cap = add(new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.06, 12), brass), this.root);
      cap.rotation.z = Math.PI / 2;
      cap.position.set(sx * 0.76, 0, -1.05);
    }
    // antebraço torneado (o veio corre no comprimento) com um anel de ferro junto do pulso
    const FORE = 9.6;
    const foreGeo = new THREE.CylinderGeometry(0.55, 0.88, FORE, 20, 12);
    lengthwiseUV(foreGeo, FORE / 2.6, (2 * Math.PI * 0.7) / 2.6);
    const fore = add(new THREE.Mesh(foreGeo, wood), this.root);
    fore.rotation.x = Math.PI / 2;
    fore.position.z = -1.45 - FORE / 2;
    const band = add(new THREE.Mesh(new THREE.TorusGeometry(0.57, 0.05, 8, 28), iron), this.root);
    band.position.z = -1.55;
    anchor(this.root, 0, 0.6, -1.3);
    // manga do paletó do boneco, com punho de camisa e abotoadura
    const SLEEVE = 6.2;
    const sleeve = add(new THREE.Mesh(new THREE.CylinderGeometry(1.06, 1.18, SLEEVE, 24, 1, true), cloth), this.root);
    sleeve.rotation.x = Math.PI / 2;
    sleeve.position.z = -4.4 - SLEEVE / 2;
    const cuff = add(new THREE.Mesh(new THREE.CylinderGeometry(0.98, 1.02, 0.5, 24, 1, true), shirt), this.root);
    cuff.rotation.x = Math.PI / 2;
    cuff.position.z = -4.25;
    const link = add(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.05, 12), brass), this.root);
    link.position.set(1.0, 0.2, -4.2);
    link.rotation.z = Math.PI / 2;
    anchor(this.root, 0, 1.15, -6.5);
    // braço de cima subindo para o escuro
    const elbow = new THREE.Group();
    elbow.position.z = -1.0 - FORE;
    elbow.rotation.x = 0.95;
    const upper = add(new THREE.Mesh(new THREE.CylinderGeometry(1.25, 1.35, 12, 18, 1, true), cloth), elbow);
    upper.rotation.x = Math.PI / 2;
    upper.position.z = -6;
    add(new THREE.Mesh(new THREE.SphereGeometry(1.25, 16, 12), cloth), elbow);
    this.root.add(elbow);

    // cordas: fios finíssimos de cada ponto subindo até sumir no escuro (o alto fica preso, a ponta segue a mão)
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(this.stringEnds.length * 6), 3).setUsage(THREE.DynamicDrawUsage));
    this.strings = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: '#e8dfc8', transparent: true, opacity: 0.4, depthWrite: false }));
    this.strings.frustumCulled = false;
    this.root.add(this.strings);
    this.root.updateMatrixWorld(true);
    this.stringTops = this.stringEnds.map((o) => {
      const p = this.root.worldToLocal(o.getWorldPosition(new THREE.Vector3()));
      return new THREE.Vector3(p.x * 1.15, 30, p.z - 4);
    });
    this.syncStrings();
  }

  private syncStrings() {
    const a = this.strings.geometry.getAttribute('position') as THREE.BufferAttribute;
    this.stringEnds.forEach((o, i) => {
      const p = this.root.worldToLocal(o.getWorldPosition(this.tmp));
      const t = this.stringTops[i];
      a.setXYZ(i * 2, p.x, p.y, p.z);
      a.setXYZ(i * 2 + 1, t.x, t.y, t.z);
    });
    a.needsUpdate = true;
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
      // sai do escuro atrás da mesa, ao lado da cabeça do dono (MASK_POS), e vem para a borda esquerda
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
    // dedos: curvam (cada um um pouco diferente) e tremem um pouco, puxados pelas cordas
    this.fingers.forEach((segs, fi) => {
      segs.forEach((s, si) => {
        const twitch = Math.sin(time * 7 + fi * 1.7 + si) * 0.05;
        s.rotation.x = curl * (si === 0 ? 0.5 : 1.1) * (1 + (fi % 2) * 0.25) + twitch;
        if (si === 0 && fi < 4) s.rotation.y = (fi - 1.5) * 0.14 * spread;
      });
    });
    r.updateMatrixWorld();
    r.getWorldPosition(this.palm);
    this.syncStrings();
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

interface Chip { c: THREE.Vector3; rad: number; depth: number }

/** Hash 3D estável (mesma posição → mesmo valor: os vértices duplicados das quinas não se separam). */
function hash3(x: number, y: number, z: number): number {
  const h = Math.sin(Math.round(x * 997) * 12.9898 + Math.round(y * 997) * 78.233 + Math.round(z * 997) * 37.719) * 43758.5453;
  return h - Math.floor(h);
}

/**
 * Bloco de madeira entalhado à mão: caixa de quinas arredondadas (normais suaves, sem emenda), com leve
 * irregularidade e lascas arrancadas (`chips` afundam os vértices com borda dentada e normal facetada).
 * UV projetado no tamanho do mundo, com o veio no comprimento (Z).
 */
export function carvedBlock(w: number, h: number, d: number, r: number, seg: [number, number, number],
  chips: Chip[], wobble: number, uvSeed: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d, Math.max(seg[0], 2) * 2, Math.max(seg[1], 2) * 2, Math.max(seg[2], 2) * 2);
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const nor = g.getAttribute('normal') as THREE.BufferAttribute;
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  const hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r;
  const v = new THREE.Vector3(), inner = new THREE.Vector3(), n = new THREE.Vector3(), fn = new THREE.Vector3();
  const chipped: boolean[] = [];
  const U = 1 / 2.6, ou = uvSeed * 0.37, ov = uvSeed * 0.61;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    fn.fromBufferAttribute(nor, i);
    inner.set(THREE.MathUtils.clamp(v.x, -hx, hx), THREE.MathUtils.clamp(v.y, -hy, hy), THREE.MathUtils.clamp(v.z, -hz, hz));
    n.subVectors(v, inner);
    if (n.lengthSq() < 1e-10) n.copy(fn); else n.normalize();
    v.copy(inner).addScaledVector(n, r);
    v.addScaledVector(n, (hash3(v.x, v.y, v.z) - 0.5) * r * 0.12 * wobble); // entalhe à mão
    let hit = false;
    for (const c of chips) {
      const dist = v.distanceTo(c.c);
      if (dist >= c.rad) continue;
      const jag = 0.55 + 0.45 * hash3(v.x + 3.1, v.y, v.z);
      v.addScaledVector(n, -c.depth * Math.pow(1 - dist / c.rad, 0.6) * jag);
      hit = true;
    }
    chipped.push(hit);
    pos.setXYZ(i, v.x, v.y, v.z);
    nor.setXYZ(i, n.x, n.y, n.z);
    // UV pela face dominante, veio ao longo de Z
    if (Math.abs(fn.x) > 0.5) uv.setXY(i, v.z * U + ou, v.y * U + ov);
    else if (Math.abs(fn.y) > 0.5) uv.setXY(i, v.z * U + ou, v.x * U + ov);
    else uv.setXY(i, v.y * U + ou, v.x * U + ov);
  }
  if (chips.length) {
    const smooth = (nor.array as Float32Array).slice();
    g.computeVertexNormals();
    for (let i = 0; i < pos.count; i++) if (!chipped[i]) nor.setXYZ(i, smooth[i * 3], smooth[i * 3 + 1], smooth[i * 3 + 2]);
  }
  return g;
}

/** Farpa de madeira: cone fino e torto, de base irregular (aponta para +Y, base na origem). */
function splinterGeometry(rad: number, len: number, seed: number): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(rad, len, 5, 2);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = hash3(x + seed, y, z - seed);
    p.setXYZ(i, x * (0.6 + k * 0.8), y, z * (0.6 + k * 0.6) + (y / len + 0.5) * rad * 0.8);
  }
  g.translate(0, len / 2, 0);
  g.computeVertexNormals();
  return g;
}

/** Cilindro com o veio no comprimento: troca U↔V e escala para o tamanho do mundo. */
function lengthwiseUV(g: THREE.BufferGeometry, along: number, around: number) {
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) { const u = uv.getX(i), v = uv.getY(i); uv.setXY(i, v * along, u * around); }
}
