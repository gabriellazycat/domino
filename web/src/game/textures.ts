import * as THREE from 'three';
import { Rng } from '../core/rng';

// Texturas 100% procedurais (canvas). Nada de imagem externa.
function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')!];
}

function tex(c: HTMLCanvasElement, repeat = 1, srgb = true): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const PIP_POS: number[][][] = [
  [],
  [[0.5, 0.5]],
  [[0.27, 0.27], [0.73, 0.73]],
  [[0.25, 0.25], [0.5, 0.5], [0.75, 0.75]],
  [[0.28, 0.28], [0.72, 0.28], [0.28, 0.72], [0.72, 0.72]],
  [[0.26, 0.26], [0.74, 0.26], [0.5, 0.5], [0.26, 0.74], [0.74, 0.74]],
  [[0.28, 0.22], [0.72, 0.22], [0.28, 0.5], [0.72, 0.5], [0.28, 0.78], [0.72, 0.78]],
];

/** Atlas 9 células: 0–6 pips, 7 = chevron (foguete), 8 = bomba (explosiva). Branco sobre transparente. */
export const ATLAS_CELLS = 9;
let atlasTex: THREE.CanvasTexture | null = null;
export function pipAtlas(): THREE.CanvasTexture {
  if (atlasTex) return atlasTex;
  const S = 128;
  const [c, g] = canvas(S * ATLAS_CELLS, S);
  g.fillStyle = '#fff';
  g.strokeStyle = '#fff';
  for (let i = 0; i <= 6; i++) {
    for (const [x, y] of PIP_POS[i]) {
      g.beginPath();
      g.arc(i * S + x * S, y * S, S * 0.085, 0, Math.PI * 2);
      g.fill();
    }
    // meia linha divisória (as duas metades formam a linha central)
    g.fillRect(i * S + S * 0.12, 0, S * 0.76, S * 0.025);
  }
  // chevron
  g.lineWidth = S * 0.11; g.lineCap = 'round'; g.lineJoin = 'round';
  for (const oy of [0.35, 0.62]) {
    g.beginPath();
    g.moveTo(7 * S + S * 0.22, S * (oy + 0.15));
    g.lineTo(7 * S + S * 0.5, S * (oy - 0.08));
    g.lineTo(7 * S + S * 0.78, S * (oy + 0.15));
    g.stroke();
  }
  // bomba
  g.beginPath(); g.arc(8 * S + S * 0.47, S * 0.58, S * 0.24, 0, Math.PI * 2); g.fill();
  g.lineWidth = S * 0.06;
  g.beginPath(); g.moveTo(8 * S + S * 0.6, S * 0.38); g.quadraticCurveTo(8 * S + S * 0.7, S * 0.2, 8 * S + S * 0.82, S * 0.22); g.stroke();
  atlasTex = new THREE.CanvasTexture(c);
  atlasTex.colorSpace = THREE.SRGBColorSpace;
  atlasTex.anisotropy = 8;
  return atlasTex;
}

export function feltTexture(): THREE.CanvasTexture {
  const S = 512;
  const [c, g] = canvas(S, S);
  g.fillStyle = '#2f5a45';
  g.fillRect(0, 0, S, S);
  const r = new Rng(7);
  const img = g.getImageData(0, 0, S, S);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (r.float() - 0.5) * 22;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  // fibras
  g.globalAlpha = 0.05;
  for (let i = 0; i < 1800; i++) {
    g.strokeStyle = r.chance(0.5) ? '#9fd1b0' : '#0d2219';
    g.beginPath();
    const x = r.float() * S, y = r.float() * S, a = r.float() * Math.PI;
    g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 6, y + Math.sin(a) * 6); g.stroke();
  }
  g.globalAlpha = 1;
  return tex(c, 1);
}

/** Grade sutil de 1 m sobre o feltro (leitura de distância). */
export function gridTexture(w: number, d: number): THREE.CanvasTexture {
  const px = 64;
  const [c, g] = canvas(w * px, d * px);
  g.clearRect(0, 0, c.width, c.height);
  g.strokeStyle = 'rgba(255,240,200,0.045)';
  g.lineWidth = 2;
  for (let x = 0; x <= w; x++) { g.beginPath(); g.moveTo(x * px, 0); g.lineTo(x * px, c.height); g.stroke(); }
  for (let z = 0; z <= d; z++) { g.beginPath(); g.moveTo(0, z * px); g.lineTo(c.width, z * px); g.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

export function woodTexture(base = '#6b4325', dark = '#3e2412', seed = 3): THREE.CanvasTexture {
  const W = 1024, H = 256;
  const [c, g] = canvas(W, H);
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);
  const r = new Rng(seed);
  // tábuas
  const planks = 4;
  for (let p = 0; p < planks; p++) {
    const y0 = (p * H) / planks;
    g.fillStyle = `rgba(0,0,0,${0.05 + r.float() * 0.12})`;
    g.fillRect(0, y0, W, H / planks);
    for (let i = 0; i < 40; i++) {
      g.strokeStyle = dark;
      g.globalAlpha = 0.08 + r.float() * 0.18;
      g.lineWidth = 1 + r.float() * 2.5;
      const y = y0 + r.float() * (H / planks);
      g.beginPath();
      g.moveTo(0, y);
      for (let x = 0; x <= W; x += 32) g.lineTo(x, y + Math.sin(x * 0.01 + i) * (2 + r.float() * 3));
      g.stroke();
    }
    g.globalAlpha = 0.6;
    g.fillStyle = dark;
    g.fillRect(0, y0, W, 2);
    // nós
    for (let k = 0; k < 2; k++) {
      g.globalAlpha = 0.25;
      g.beginPath();
      g.ellipse(r.float() * W, y0 + r.float() * (H / planks), 10 + r.float() * 12, 4 + r.float() * 4, 0, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.globalAlpha = 1;
  return tex(c, 1);
}

export function stoneTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, g] = canvas(S, S);
  g.fillStyle = '#7d7a76';
  g.fillRect(0, 0, S, S);
  const r = new Rng(11);
  const rows = 4;
  for (let row = 0; row < rows; row++) {
    const h = S / rows;
    let x = row % 2 ? -h * 0.6 : 0;
    while (x < S) {
      const w = h * (1.1 + r.float() * 0.8);
      const l = 95 + Math.floor(r.float() * 50);
      g.fillStyle = `rgb(${l},${l - 3},${l - 8})`;
      g.fillRect(x + 3, row * h + 3, w - 6, h - 6);
      g.fillStyle = 'rgba(255,255,255,0.08)';
      g.fillRect(x + 3, row * h + 3, w - 6, 4);
      x += w;
    }
  }
  return tex(c, 1);
}

export function hedgeTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, g] = canvas(S, S);
  g.fillStyle = '#2f6b2a';
  g.fillRect(0, 0, S, S);
  const r = new Rng(5);
  for (let i = 0; i < 900; i++) {
    const l = r.float();
    g.fillStyle = l < 0.3 ? '#1f4d1d' : l < 0.75 ? '#3f8a35' : '#6fb85a';
    g.beginPath();
    g.ellipse(r.float() * S, r.float() * S, 4 + r.float() * 6, 2 + r.float() * 3, r.float() * Math.PI, 0, Math.PI * 2);
    g.fill();
  }
  return tex(c, 1);
}

export function crateTexture(): THREE.CanvasTexture {
  const S = 256;
  const [c, g] = canvas(S, S);
  g.drawImage(woodTexture('#a8743f', '#5c3a19', 9).image as HTMLCanvasElement, 0, 0, S, S);
  g.strokeStyle = '#4a2c12';
  g.lineWidth = 18;
  g.strokeRect(9, 9, S - 18, S - 18);
  g.beginPath(); g.moveTo(9, 9); g.lineTo(S - 9, S - 9); g.stroke();
  return tex(c, 1);
}

export function softDot(): THREE.CanvasTexture {
  const S = 64;
  const [c, g] = canvas(S, S);
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.4, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, S, S);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
