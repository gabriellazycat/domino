import * as THREE from 'three';
import { Rng } from '../core/rng';

// Marcas na mesa que ficam durante a fase: respingo de tinta onde um inimigo tomba e queimado de
// explosão. Texturas geradas em canvas (sem arquivo). As marcas são instanciadas: um InstancedMesh por
// (textura, cor), então dezenas de marcas custam poucas chamadas de desenho. O material é compartilhado,
// então o "apagar" da mão é um único fade.

const SPLAT_VARIANTS = 4;
/** marcas por grupo (textura + cor); ao lotar, a mais antiga é reaproveitada */
const CAP = 160;

let splatTex: THREE.CanvasTexture[] | null = null;
let scorchTex: THREE.CanvasTexture | null = null;

function canvas(S: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = c.height = S;
  return [c, c.getContext('2d')!];
}

/** Respingo: poça irregular com dedos e gotas soltas. Branco; a cor vem do material. */
function splatTexture(seed: number): THREE.CanvasTexture {
  const S = 256;
  const [c, g] = canvas(S);
  const r = new Rng(seed);
  g.translate(S / 2, S / 2);
  g.fillStyle = '#fff';
  g.beginPath();
  const n = 18;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI * 2;
    // raio oscila: poça grande com tentáculos curtos
    const rad = S * (0.2 + r.float() * 0.07 + (i % 3 === 0 ? 0.09 * r.float() : 0));
    const x = Math.cos(a) * rad, y = Math.sin(a) * rad;
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.closePath();
  g.fill();
  for (let i = 0; i < 16; i++) {
    const a = r.float() * Math.PI * 2, d = S * (0.26 + r.float() * 0.2);
    g.beginPath();
    g.arc(Math.cos(a) * d, Math.sin(a) * d, 2 + r.float() * 6, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Queimado: mancha escura que some pelas bordas, com fuligem em pontinhos. */
function scorchTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, g] = canvas(S);
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.55, 'rgba(255,255,255,0.8)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  const r = new Rng(41);
  for (let i = 0; i < 260; i++) {
    const a = r.float() * Math.PI * 2, d = S * 0.5 * Math.sqrt(r.float()) * 0.9;
    g.fillStyle = `rgba(255,255,255,${0.2 + r.float() * 0.5})`;
    g.beginPath();
    g.arc(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, 0.8 + r.float() * 2.2, 0, Math.PI * 2);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Group { mesh: THREE.InstancedMesh; mat: THREE.MeshStandardMaterial; n: number; next: number }

export class Decals {
  private groups = new Map<string, Group>();
  private geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  private dummy = new THREE.Object3D();
  private rng = new Rng(77);
  private opacity = 1;

  constructor(private scene: THREE.Scene) {
    splatTex ??= Array.from({ length: SPLAT_VARIANTS }, (_, i) => splatTexture(101 + i * 17));
    scorchTex ??= scorchTexture();
  }

  private group(tex: THREE.Texture, color: string): Group {
    const key = `${tex.uuid}:${color}`;
    let g = this.groups.get(key);
    if (!g) {
      const mat = new THREE.MeshStandardMaterial({
        map: tex, color, transparent: true, depthWrite: false, roughness: 0.55, metalness: 0, opacity: this.opacity,
        polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      });
      const mesh = new THREE.InstancedMesh(this.geo, mat, CAP);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.count = 0;
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      g = { mesh, mat, n: 0, next: 0 };
      this.groups.set(key, g);
    }
    return g;
  }

  private place(tex: THREE.Texture, color: string, x: number, z: number, size: number, stretch = 1) {
    const g = this.group(tex, color);
    const i = g.next;
    g.next = (g.next + 1) % CAP;
    g.n = Math.min(CAP, g.n + 1);
    this.dummy.position.set(x, 0.006 + this.rng.float() * 0.0006, z);
    this.dummy.rotation.set(0, this.rng.float() * Math.PI * 2, 0);
    this.dummy.scale.set(size, 1, size * stretch);
    this.dummy.updateMatrix();
    g.mesh.setMatrixAt(i, this.dummy.matrix);
    g.mesh.instanceMatrix.needsUpdate = true;
    g.mesh.count = g.n;
  }

  /** Respingo de tinta (inimigo derrubado): `r` em metros, cor escura do inimigo. */
  splat(x: number, z: number, r: number, color: string) {
    const tex = splatTex![this.rng.int(0, SPLAT_VARIANTS - 1)];
    this.place(tex, color, x, z, r * 2 * (0.9 + this.rng.float() * 0.2), 0.9 + this.rng.float() * 0.2);
  }

  /** Queimado da explosão, com alguns respingos ao redor. */
  scorch(x: number, z: number, r: number) {
    this.place(scorchTex!, '#0a0605', x, z, r * 2.2);
    for (let i = 0; i < 3; i++) {
      const a = this.rng.float() * Math.PI * 2, d = r * (0.5 + this.rng.float() * 0.6);
      this.splat(x + Math.cos(a) * d, z + Math.sin(a) * d, 0.18 + this.rng.float() * 0.2, '#1a0606');
    }
  }

  /** Apaga as marcas aos poucos (a mão varre a mesa). `dt` em segundos. */
  fade(dt: number) { this.setOpacity(Math.max(0, this.opacity - dt * 1.6)); }

  /** Some com todas as marcas e volta a opacidade total (fase nova). */
  clear() {
    for (const g of this.groups.values()) { g.n = 0; g.next = 0; g.mesh.count = 0; }
    this.setOpacity(1);
  }

  private setOpacity(o: number) {
    this.opacity = o;
    for (const g of this.groups.values()) g.mat.opacity = o;
  }
}
