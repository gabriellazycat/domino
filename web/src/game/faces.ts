import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PIECES, PieceId } from '../core/pieces';

// Rostos 2D dos dominós: um atlas de expressões desenhado em canvas (traço branco sobre transparente,
// tingido com a cor dos pips de cada peça) e um "FaceRig" por peça que escolhe a expressão,
// pisca, olha para os lados e treme de medo.

export const EXPRS = ['neutral', 'blink', 'lookL', 'lookR', 'nervous', 'scared', 'scream', 'dizzy', 'happy', 'sad', 'worriedL', 'worriedC', 'worriedR'] as const;
export type Expr = typeof EXPRS[number];
/** O que o jogo pede: uma expressão do atlas ou 'worried' (olhos correndo de um lado pro outro). */
export type FaceBase = Expr | 'worried';
const CELL = 128;

let atlas: THREE.CanvasTexture | null = null;
export function faceAtlas(): THREE.CanvasTexture {
  if (atlas) return atlas;
  const c = document.createElement('canvas');
  c.width = CELL * EXPRS.length; c.height = CELL;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  g.strokeStyle = '#fff';
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const S = CELL;
  const lw = (k: number) => { g.lineWidth = S * k; };
  const circle = (x: number, y: number, r: number, fill: boolean) => { g.beginPath(); g.arc(x * S, y * S, r * S, 0, Math.PI * 2); if (fill) g.fill(); else g.stroke(); };
  const ellipse = (x: number, y: number, rx: number, ry: number, fill: boolean) => { g.beginPath(); g.ellipse(x * S, y * S, rx * S, ry * S, 0, 0, Math.PI * 2); if (fill) g.fill(); else g.stroke(); };
  const line = (pts: [number, number][]) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x * S, y * S) : g.moveTo(x * S, y * S))); g.stroke(); };
  const arc = (x: number, y: number, r: number, a0: number, a1: number) => { g.beginPath(); g.arc(x * S, y * S, r * S, a0, a1); g.stroke(); };
  const wave = (x0: number, x1: number, y: number, amp: number, n: number) => {
    g.beginPath();
    for (let i = 0; i <= 24; i++) { const t = i / 24; const x = x0 + (x1 - x0) * t; const yy = y + Math.sin(t * Math.PI * n) * amp; if (i) g.lineTo(x * S, yy * S); else g.moveTo(x * S, yy * S); }
    g.stroke();
  };
  const drop = (x: number, y: number, r: number) => {
    g.beginPath(); g.moveTo(x * S, (y - r * 2.2) * S);
    g.quadraticCurveTo((x + r * 1.2) * S, (y - r * 0.2) * S, x * S, (y + r) * S);
    g.quadraticCurveTo((x - r * 1.2) * S, (y - r * 0.2) * S, x * S, (y - r * 2.2) * S);
    g.stroke();
  };
  const EL = 0.31, ER = 0.69, EY = 0.4;
  // olho padrão: contorno + pupila
  const eye = (x: number, y: number, r: number, px: number, py: number, pr: number) => { lw(0.055); circle(x, y, r, false); circle(x + px, y + py, pr, true); };

  EXPRS.forEach((ex, i) => {
    g.save();
    g.translate(i * S, 0);
    switch (ex) {
      case 'neutral':
        eye(EL, EY, 0.11, 0, 0.01, 0.05); eye(ER, EY, 0.11, 0, 0.01, 0.05);
        lw(0.055); line([[0.4, 0.74], [0.6, 0.73]]);
        break;
      case 'blink':
        lw(0.06); arc(EL, EY - 0.03, 0.1, 0.25 * Math.PI, 0.75 * Math.PI); arc(ER, EY - 0.03, 0.1, 0.25 * Math.PI, 0.75 * Math.PI);
        lw(0.055); line([[0.4, 0.74], [0.6, 0.73]]);
        break;
      case 'lookL':
      case 'lookR': {
        const s = ex === 'lookL' ? -1 : 1;
        eye(EL, EY, 0.11, s * 0.05, 0.01, 0.05); eye(ER, EY, 0.11, s * 0.05, 0.01, 0.05);
        lw(0.055); line([[0.42 + s * 0.03, 0.74], [0.6 + s * 0.03, 0.75]]);
        break;
      }
      case 'nervous':
        eye(EL, EY + 0.02, 0.1, 0.02, 0.02, 0.035); eye(ER, EY + 0.02, 0.1, -0.02, 0.02, 0.035);
        lw(0.05); line([[0.2, 0.22], [0.38, 0.17]]); line([[0.62, 0.17], [0.8, 0.22]]);
        lw(0.05); wave(0.36, 0.64, 0.75, 0.025, 3);
        lw(0.04); drop(0.88, 0.32, 0.045);
        break;
      case 'scared':
        eye(EL, EY, 0.14, 0, 0, 0.028); eye(ER, EY, 0.14, 0, 0, 0.028);
        lw(0.05); line([[0.17, 0.18], [0.36, 0.12]]); line([[0.64, 0.12], [0.83, 0.18]]);
        lw(0.05); ellipse(0.5, 0.77, 0.08, 0.06, false);
        lw(0.04); drop(0.12, 0.36, 0.04);
        break;
      case 'scream':
        lw(0.06); line([[0.2, 0.32], [0.38, 0.4], [0.2, 0.46]]); line([[0.8, 0.32], [0.62, 0.4], [0.8, 0.46]]);
        ellipse(0.5, 0.73, 0.13, 0.17, true);
        break;
      case 'dizzy':
        lw(0.06);
        for (const x of [EL, ER]) { line([[x - 0.08, EY - 0.08], [x + 0.08, EY + 0.08]]); line([[x + 0.08, EY - 0.08], [x - 0.08, EY + 0.08]]); }
        lw(0.05); wave(0.34, 0.66, 0.73, 0.03, 4);
        ellipse(0.56, 0.8, 0.04, 0.05, true);
        break;
      case 'happy':
        lw(0.06); arc(EL, EY + 0.04, 0.1, 1.1 * Math.PI, 1.9 * Math.PI); arc(ER, EY + 0.04, 0.1, 1.1 * Math.PI, 1.9 * Math.PI);
        g.beginPath(); g.moveTo(0.3 * S, 0.64 * S); g.quadraticCurveTo(0.5 * S, 0.95 * S, 0.7 * S, 0.64 * S); g.closePath(); g.fill();
        break;
      case 'sad':
        eye(EL, EY + 0.03, 0.1, 0, 0.04, 0.045); eye(ER, EY + 0.03, 0.1, 0, 0.04, 0.045);
        lw(0.05); line([[0.2, 0.2], [0.38, 0.26]]); line([[0.62, 0.26], [0.8, 0.2]]);
        lw(0.055); arc(0.5, 0.88, 0.14, 1.2 * Math.PI, 1.8 * Math.PI);
        lw(0.04); drop(0.27, 0.62, 0.04);
        break;
      case 'worriedL':
      case 'worriedC':
      case 'worriedR': {
        // preocupado: sobrancelhas de dó, olhos arregalados correndo de um lado pro outro, boca tremida
        const s = ex === 'worriedL' ? -1 : ex === 'worriedR' ? 1 : 0;
        eye(EL, EY + 0.01, 0.12, s * 0.065, -0.01, 0.042); eye(ER, EY + 0.01, 0.12, s * 0.065, -0.01, 0.042);
        lw(0.05); line([[0.18, 0.21], [0.37, 0.14]]); line([[0.63, 0.14], [0.82, 0.21]]);
        lw(0.05); wave(0.4 + s * 0.02, 0.6 + s * 0.02, 0.76, 0.02, 2);
        break;
      }
    }
    g.restore();
  });
  atlas = new THREE.CanvasTexture(c);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.anisotropy = 8;
  return atlas;
}

const geoCache = new Map<string, THREE.BufferGeometry>();
/** Dois quadrados (frente e verso) na metade de cima da peça, mapeados na célula da expressão. */
export function faceGeometry(type: PieceId, ex: Expr): THREE.BufferGeometry {
  const key = `${type}:${ex}`;
  const hit = geoCache.get(key);
  if (hit) return hit;
  const d = PIECES[type];
  const fw = d.w * 0.86, fh = (d.h * 0.92) / 2;
  const q = Math.min(fw, fh) * 0.98;
  const cell = EXPRS.indexOf(ex);
  const z = d.t / 2 + 0.002;
  const parts: THREE.BufferGeometry[] = [];
  for (const flip of [false, true]) {
    const p = new THREE.PlaneGeometry(q, q);
    const uv = p.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setX(i, (cell + uv.getX(i)) / EXPRS.length);
    if (flip) p.rotateY(Math.PI);
    p.translate(0, fh / 2 + (fh - q) * 0.15, flip ? -z : z);
    parts.push(p);
  }
  const geo = mergeGeometries(parts, false)!;
  geo.computeBoundingSphere();
  geoCache.set(key, geo);
  return geo;
}

const matCache = new Map<PieceId, THREE.Material>();
function faceMaterial(type: PieceId): THREE.Material {
  const hit = matCache.get(type);
  if (hit) return hit;
  const d = PIECES[type];
  const m = new THREE.MeshStandardMaterial({
    map: faceAtlas(), color: new THREE.Color(d.pip), alphaTest: 0.45, roughness: 0.5,
    polygonOffset: true, polygonOffsetFactor: -2,
  });
  if (type === 'heavy') { m.emissive = new THREE.Color('#f2a93a'); m.emissiveIntensity = 0.35; }
  matCache.set(type, m);
  return m;
}

/** Controla o rosto de uma peça: expressão base + piscadas, olhadelas, olhos correndo e tremedeira. */
export class FaceRig {
  mesh: THREE.Mesh;
  /** expressão pedida pelo jogo (humor geral ou estado físico) */
  base: FaceBase = 'worried';
  private shown: Expr = 'worriedC';
  private t = 0;
  private nextBlink = 1 + Math.random() * 4;
  private blinkUntil = -1;
  private glance: Expr | null = null;
  private glanceUntil = -1;
  private nextGlance = 3 + Math.random() * 8;
  private dart: Expr = Math.random() < 0.5 ? 'worriedL' : 'worriedR';
  private nextDart = Math.random() * 0.5;
  private startleUntil = -1;

  constructor(public type: PieceId) {
    this.mesh = new THREE.Mesh(faceGeometry(type, 'worriedC'), faceMaterial(type));
    this.mesh.receiveShadow = true;
  }

  /** Susto rápido (acabou de ser colocada na mesa). */
  startle(dur = 0.45) { this.startleUntil = this.t + dur; }

  update(dt: number) {
    this.t += dt;
    const b = this.base;
    let ex: Expr;
    if (b === 'worried') {
      // olhos correndo de um lado pro outro, sem parar (às vezes param no meio)
      if (this.t > this.nextDart) {
        this.dart = this.dart === 'worriedL' ? (Math.random() < 0.8 ? 'worriedR' : 'worriedC')
          : this.dart === 'worriedR' ? (Math.random() < 0.8 ? 'worriedL' : 'worriedC')
          : (Math.random() < 0.5 ? 'worriedL' : 'worriedR');
        this.nextDart = this.t + (this.dart === 'worriedC' ? 0.15 + Math.random() * 0.2 : 0.25 + Math.random() * 0.45);
      }
      ex = this.dart;
    } else ex = b;
    // piscar (não nas expressões de olho fechado/arregalado de susto)
    if (b === 'neutral' || b === 'nervous' || b === 'sad' || b === 'worried') {
      if (this.t > this.nextBlink) { this.blinkUntil = this.t + 0.12; this.nextBlink = this.t + (b === 'nervous' || b === 'worried' ? 1 + Math.random() * 2.5 : 2 + Math.random() * 5); }
      if (this.t < this.blinkUntil) ex = 'blink';
    }
    // olhadela para o lado quando está tranquilo
    if (b === 'neutral' && ex === 'neutral') {
      if (this.t > this.nextGlance) { this.glance = Math.random() < 0.5 ? 'lookL' : 'lookR'; this.glanceUntil = this.t + 0.6 + Math.random() * 1.2; this.nextGlance = this.t + 4 + Math.random() * 9; }
      if (this.glance && this.t < this.glanceUntil) ex = this.glance;
    }
    const startled = this.t < this.startleUntil && (b === 'worried' || b === 'neutral');
    if (startled) ex = 'scared';
    if (ex !== this.shown) { this.shown = ex; this.mesh.geometry = faceGeometry(this.type, ex); }
    // tremedeira de medo
    const shake = b === 'scared' || startled ? 0.006 : b === 'scream' ? 0.004 : b === 'nervous' || b === 'worried' ? 0.0015 : 0;
    this.mesh.position.set(shake ? (Math.random() - 0.5) * shake : 0, shake ? (Math.random() - 0.5) * shake : 0, 0);
  }
}

/** Inclinação (rad) a partir de um quaternion (0 = em pé). */
export function tiltOfQuat(q: { x: number; z: number }): number {
  const upY = 1 - 2 * (q.x * q.x + q.z * q.z);
  return Math.acos(Math.max(-1, Math.min(1, upY)));
}
