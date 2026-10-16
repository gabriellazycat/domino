import * as THREE from 'three';
import type { EnemyKind } from '../core/mapgen';

// Rostos dos soldadinhos assombrados: olhos ocos pretos com um pontinho de luz e boca costurada,
// desenhados num atlas (canvas) e colados numa calota curva na frente da cabeça. O pontinho
// é branco no atlas e tingido pela cor do material (brilha no bloom); o preto continua preto.

export const ENEMY_EXPRS = ['idle', 'blink', 'lookL', 'lookR', 'alarm', 'hurt', 'dizzy', 'smug', 'angry'] as const;
export type EnemyExpr = typeof ENEMY_EXPRS[number];
const CELL = 128;

let atlas: THREE.CanvasTexture | null = null;
function enemyAtlas(): THREE.CanvasTexture {
  if (atlas) return atlas;
  const c = document.createElement('canvas');
  c.width = CELL * ENEMY_EXPRS.length; c.height = CELL;
  const g = c.getContext('2d')!;
  const S = CELL;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const BLACK = '#040202', LIGHT = '#ffffff';
  const ell = (x: number, y: number, rx: number, ry: number, col: string, rot = 0) => { g.fillStyle = col; g.beginPath(); g.ellipse(x * S, y * S, rx * S, ry * S, rot, 0, Math.PI * 2); g.fill(); };
  const line = (pts: [number, number][], w: number, col = BLACK) => { g.strokeStyle = col; g.lineWidth = w * S; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x * S, y * S) : g.moveTo(x * S, y * S))); g.stroke(); };
  const EL = 0.33, ER = 0.67, EY = 0.42;
  // boca costurada: linha + pontos atravessados; `curve` > 0 sobe dos lados (deboche), < 0 desce (bravo)
  const mouth = (curve = 0, tilt = 0) => {
    const pts: [number, number][] = [];
    for (let i = 0; i <= 8; i++) { const t = i / 8; const x = 0.36 + 0.28 * t; pts.push([x, 0.74 - curve * Math.pow(2 * t - 1, 2) + tilt * (t - 0.5)]); }
    line(pts, 0.035);
    for (const t of [0.2, 0.5, 0.8]) { const [x, y] = pts[Math.round(t * 8)]; line([[x, y - 0.045], [x, y + 0.045]], 0.025); }
  };
  const eyes = (rx: number, ry: number, dx: number, dy: number, dot: number) => {
    for (const x of [EL, ER]) { ell(x, EY, rx, ry, BLACK); if (dot > 0) ell(x + dx, EY + dy, dot, dot, LIGHT); }
  };

  ENEMY_EXPRS.forEach((ex, i) => {
    g.save();
    g.translate(i * S, 0);
    switch (ex) {
      case 'idle': eyes(0.11, 0.085, 0, 0.005, 0.03); mouth(); break;
      case 'blink': for (const x of [EL, ER]) line([[x - 0.1, EY + 0.01], [x + 0.1, EY + 0.01]], 0.05); mouth(); break;
      case 'lookL': eyes(0.11, 0.085, -0.05, 0.005, 0.03); mouth(0, 0.03); break;
      case 'lookR': eyes(0.11, 0.085, 0.05, 0.005, 0.03); mouth(0, -0.03); break;
      case 'alarm':
        eyes(0.135, 0.13, 0, 0, 0.02);
        line([[0.2, 0.2], [0.42, 0.16]], 0.04); line([[0.58, 0.16], [0.8, 0.2]], 0.04);
        ell(0.5, 0.77, 0.06, 0.07, BLACK);
        break;
      case 'hurt':
        line([[EL - 0.1, EY - 0.07], [EL + 0.08, EY], [EL - 0.1, EY + 0.07]], 0.05);
        line([[ER + 0.1, EY - 0.07], [ER - 0.08, EY], [ER + 0.1, EY + 0.07]], 0.05);
        line([[0.36, 0.76], [0.43, 0.71], [0.5, 0.77], [0.57, 0.71], [0.64, 0.76]], 0.035);
        break;
      case 'dizzy':
        for (const x of [EL, ER]) { line([[x - 0.08, EY - 0.08], [x + 0.08, EY + 0.08]], 0.05); line([[x + 0.08, EY - 0.08], [x - 0.08, EY + 0.08]], 0.05); }
        mouth(-0.04);
        break;
      case 'smug':
        // olhos meio fechados (pálpebra reta em cima) olhando de lado + sorrisinho costurado torto
        for (const x of [EL, ER]) {
          ell(x, EY + 0.02, 0.11, 0.07, BLACK);
          ell(x + 0.045, EY + 0.035, 0.026, 0.026, LIGHT);
          g.clearRect((x - 0.13) * S, (EY - 0.09) * S, 0.26 * S, 0.075 * S);
          line([[x - 0.12, EY - 0.015], [x + 0.12, EY - 0.015]], 0.035);
        }
        mouth(0.05, -0.05);
        break;
      case 'angry':
        eyes(0.11, 0.08, 0, 0.015, 0.03);
        line([[0.18, 0.24], [0.43, 0.36]], 0.055); line([[0.57, 0.36], [0.82, 0.24]], 0.055);
        mouth(-0.05);
        break;
    }
    g.restore();
  });
  atlas = new THREE.CanvasTexture(c);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.anisotropy = 8;
  return atlas;
}

const geoCache = new Map<string, THREE.BufferGeometry>();
/** Calota de esfera na frente da cabeça (raio `r`), com UV apontando para a célula da expressão. */
function faceGeometry(r: number, ex: EnemyExpr): THREE.BufferGeometry {
  const key = `${r.toFixed(4)}:${ex}`;
  const hit = geoCache.get(key);
  if (hit) return hit;
  const g = new THREE.SphereGeometry(r, 16, 12, Math.PI / 2 - 0.95, 1.9, Math.PI / 2 - 0.8, 1.6);
  const cell = ENEMY_EXPRS.indexOf(ex);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setX(i, (cell + uv.getX(i)) / ENEMY_EXPRS.length);
  geoCache.set(key, g);
  return g;
}

const matCache = new Map<string, THREE.Material>();
function faceMaterial(glint: string, power: number): THREE.Material {
  const key = `${glint}:${power}`;
  const hit = matCache.get(key);
  if (hit) return hit;
  const m = new THREE.MeshBasicMaterial({
    map: enemyAtlas(), color: new THREE.Color(glint).multiplyScalar(power), alphaTest: 0.4,
    toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2,
  });
  matCache.set(key, m);
  return m;
}

/** Controla o rosto de um inimigo: expressão base, piscadas, olhadelas e reações rápidas. */
export class EnemyFaceRig {
  mesh: THREE.Mesh;
  base: EnemyExpr;
  private shown: EnemyExpr;
  private t = Math.random() * 10;
  private nextBlink = 1 + Math.random() * 4;
  private blinkUntil = -1;
  private glance: EnemyExpr | null = null;
  private glanceUntil = -1;
  private nextGlance = 2 + Math.random() * 6;
  private flash: EnemyExpr | null = null;
  private flashUntil = -1;
  private radius: number;

  /** `r`: raio da cabeça; a calota fica um tiquinho por fora. */
  constructor(public kind: EnemyKind, r: number, glint: string) {
    this.base = kind === 'general' ? 'angry' : 'idle';
    this.shown = this.base;
    this.radius = r * 1.03;
    this.mesh = new THREE.Mesh(faceGeometry(this.radius, this.base), faceMaterial(glint, kind === 'brute' || kind === 'general' ? 3.5 : 2.5));
  }

  /** Reação rápida por cima da expressão base (susto, golpe). */
  react(ex: EnemyExpr, dur: number) { this.flash = ex; this.flashUntil = this.t + dur; }

  reset() { this.base = this.kind === 'general' ? 'angry' : 'idle'; this.flash = null; }

  update(dt: number) {
    this.t += dt;
    let ex: EnemyExpr = this.base;
    if (this.flash && this.t < this.flashUntil) ex = this.flash;
    else if (ex === 'idle' || ex === 'angry') {
      if (this.t > this.nextBlink) { this.blinkUntil = this.t + 0.12; this.nextBlink = this.t + 2 + Math.random() * 4; }
      if (ex === 'idle' && this.t > this.nextGlance) { this.glance = Math.random() < 0.5 ? 'lookL' : 'lookR'; this.glanceUntil = this.t + 0.5 + Math.random() * 1.2; this.nextGlance = this.t + 2.5 + Math.random() * 5; }
      if (ex === 'idle' && this.glance && this.t < this.glanceUntil) ex = this.glance;
      if (this.t < this.blinkUntil) ex = 'blink';
    }
    if (ex !== this.shown) { this.shown = ex; this.mesh.geometry = faceGeometry(this.radius, ex); }
    // tremedeira no susto/golpe
    const sh = ex === 'alarm' ? 0.004 : ex === 'hurt' ? 0.006 : 0;
    this.mesh.rotation.set(sh ? (Math.random() - 0.5) * sh * 6 : 0, sh ? (Math.random() - 0.5) * sh * 6 : 0, 0);
  }
}
