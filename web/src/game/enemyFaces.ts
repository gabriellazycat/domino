import * as THREE from 'three';
import type { EnemyKind } from '../core/mapgen';

// Rostos dos soldadinhos assombrados: olhos ocos pretos com um pontinho de luz e boca costurada,
// desenhados num atlas (canvas) e colados numa calota curva na frente da cabeça. O pontinho
// é branco no atlas e tingido pela cor do material (brilha no bloom); o preto continua preto.

// Os olhos são o mesmo olho 2D de vórtice preto do dono da mesa: o atlas só traz boca e expressões sem olho
// aberto, e uma calota com shader (vortexCap) desenha o vórtice por cima.

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

  ENEMY_EXPRS.forEach((ex, i) => {
    g.save();
    g.translate(i * S, 0);
    switch (ex) {
      case 'idle': mouth(); break;
      case 'blink': for (const x of [EL, ER]) line([[x - 0.1, EY + 0.01], [x + 0.1, EY + 0.01]], 0.05); mouth(); break;
      case 'lookL': mouth(0, 0.03); break;
      case 'lookR': mouth(0, -0.03); break;
      case 'alarm':
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

const VORTEX_VERT = `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const VORTEX_FRAG = `
uniform float uTime, uAnger, uWide, uLook;
varying vec2 vUv;
float h1(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float eyeD(vec2 q, float e, float side) {
  float top = e * 1.3 - uAnger * (0.12 * e + max(0.0, -q.x * side) * 0.85);   // raiva: canto de dentro desce
  return max(length(q) - e, q.y - top);
}
vec4 eye(vec2 q, float side) {
  float e = 0.12 * (1.0 + 0.3 * uWide);
  vec2 c = vec2(uLook * 0.04, 0.0);
  vec2 qc = q - c;
  float a = atan(qc.y, qc.x);
  float d = eyeD(q, e, side) + 0.008 * sin(a * 7.0 + uTime * 3.0) + 0.005 * sin(a * 13.0 - uTime * 5.0);
  vec3 col = vec3(0.0); float alpha = 1.0 - smoothstep(-0.003, 0.003, d);
  for (int k = 0; k < 12; k++) {                       // tinta preta sugada em 3 braços
    float fk = float(k) + side * 50.0;
    float s = h1(fk + 1.0), s2 = h1(fk + 9.7);
    float l = fract(uTime * 0.22 * (0.7 + 0.6 * s2) + s);
    float rr = 0.27 * pow(1.0 - l, 0.85);
    float ang = floor(s * 3.0) / 3.0 * 6.2832 + (s2 - 0.5) * 0.6 - side * (l * 4.0 + uTime * 0.4);
    vec2 p = c * l + rr * vec2(cos(ang), sin(ang));
    vec2 tg = normalize(vec2(-sin(ang), cos(ang)));
    vec2 dd = q - p;
    float sz = mix(0.012, 0.004, l);
    float blob = 1.0 - smoothstep(0.55, 1.0, length(vec2(dot(dd, tg) / (sz * (1.5 + 3.5 * l)), dot(dd, vec2(-tg.y, tg.x)) / sz)));
    alpha = max(alpha, blob * smoothstep(0.0, 0.18, l));
  }
  for (int k = 0; k < 3; k++) {                        // lascas brancas raras caindo no centro
    float fk = float(k) + 40.0 + side * 50.0;
    float s = h1(fk + 1.0), s2 = h1(fk + 5.1);
    float l = fract(uTime * 0.16 * (0.75 + 0.5 * s2) + s);
    float rr = 0.26 * pow(1.0 - l, 1.6);
    float ang = s * 6.2832 - side * (pow(l, 1.5) * 5.0 + uTime * 0.3);
    vec2 p = c * l + rr * vec2(cos(ang), sin(ang));
    vec2 tg = normalize(vec2(-sin(ang), cos(ang)));
    vec2 dd = q - p;
    float sz = mix(0.008, 0.0015, pow(l, 1.3));
    float body = 1.0 - smoothstep(0.75, 0.9, length(vec2(dot(dd, tg) / (sz * (1.2 + 4.0 * l * l)), dot(dd, vec2(-tg.y, tg.x)) / sz)));
    float f = body * smoothstep(0.0, 0.1, l) * (1.0 - smoothstep(0.9, 1.0, l));
    col = mix(col, vec3(0.97, 0.95, 0.9), f); alpha = max(alpha, f);
  }
  return vec4(col, alpha);
}
void main() {
  vec2 q = vec2((vUv.x - 0.5) * 1.9, (vUv.y - 0.5) * 1.6);    // em radianos na calota
  vec4 l = eye(q - vec2(-0.323, 0.128), -1.0);
  vec4 r = eye(q - vec2(0.323, 0.128), 1.0);
  vec4 o = l.a > r.a ? l : r;
  if (o.a < 0.02) discard;
  gl_FragColor = vec4(o.rgb, o.a);
}`;

/** Calota com os olhos de vórtice (um material por inimigo: cada um tem a sua expressão). */
function vortexCap(r: number) {
  const u = { uTime: { value: Math.random() * 10 }, uAnger: { value: 0 }, uWide: { value: 0 }, uLook: { value: 0 } };
  const m = new THREE.ShaderMaterial({ uniforms: u, vertexShader: VORTEX_VERT, fragmentShader: VORTEX_FRAG, transparent: true,
    depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, toneMapped: false });
  const g = new THREE.SphereGeometry(r * 1.004, 20, 14, Math.PI / 2 - 0.95, 1.9, Math.PI / 2 - 0.8, 1.6);
  return { mesh: new THREE.Mesh(g, m), u };
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
  private vortex: ReturnType<typeof vortexCap> | null = null;
  private spin = 1;

  /** `r`: raio da cabeça; a calota fica um tiquinho por fora. */
  constructor(public kind: EnemyKind, r: number, glint: string) {
    this.base = kind === 'general' ? 'angry' : 'idle';
    this.shown = this.base;
    this.radius = r * 1.03;
    this.mesh = new THREE.Mesh(faceGeometry(this.radius, this.base), faceMaterial(glint, kind === 'brute' || kind === 'general' || kind === 'ogre' ? 3.5 : 2.5));
    this.vortex = vortexCap(this.radius);
    this.mesh.add(this.vortex.mesh);
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
    if (this.vortex) {
      // o olho nunca fecha: a expressão muda a forma e o giro (raiva corta, susto cresce, tonto gira ao contrário)
      const u = this.vortex.u, k = 1 - Math.exp(-dt * 6);
      const anger = ex === 'angry' ? 1 : 0, wide = ex === 'alarm' ? 1 : ex === 'hurt' ? 0.7 : 0;
      const look = ex === 'lookL' ? -1 : ex === 'lookR' ? 1 : 0;
      u.uAnger.value += (anger - u.uAnger.value) * k;
      u.uWide.value += (wide - u.uWide.value) * k;
      u.uLook.value += (look - u.uLook.value) * k;
      const goal = ex === 'dizzy' ? -3 : 1 + anger * 2 + wide * 3;
      this.spin += (goal - this.spin) * (1 - Math.exp(-dt * 3));
      u.uTime.value += this.spin * dt;
    }
    if (ex !== this.shown) { this.shown = ex; this.mesh.geometry = faceGeometry(this.radius, ex); }
    // tremedeira no susto/golpe
    const sh = ex === 'alarm' ? 0.004 : ex === 'hurt' ? 0.006 : 0;
    this.mesh.rotation.set(sh ? (Math.random() - 0.5) * sh * 6 : 0, sh ? (Math.random() - 0.5) * sh * 6 : 0, 0);
  }
}
