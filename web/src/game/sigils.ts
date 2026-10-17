import * as THREE from 'three';
import { SealId, SEALS, SEAL_ORDER } from '../core/cards';
import { BuffId, BUFFS } from '../core/buffs';

// Desenhos dos SELOS (carimbo de tinta, com a tinta falhando como num carimbo de verdade) e dos
// ícones das BÊNÇÃOS. Os mesmos canvases viram textura 3D (carimbo na peça) e imagem na interface.

/** Gerador simples e determinístico (a "falha" da tinta é sempre a mesma em cada selo). */
function rnd(seed: number) {
  let s = seed >>> 0 || 1;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

function drawSeal(g: CanvasRenderingContext2D, id: SealId, S: number, ox = 0, oy = 0) {
  const ink = SEALS[id].ink;
  const cx = ox + S / 2, cy = oy + S / 2;
  g.save();
  g.strokeStyle = ink;
  g.fillStyle = ink;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  // anel duplo do carimbo
  g.lineWidth = S * 0.075;
  g.beginPath(); g.arc(cx, cy, S * 0.43, 0, Math.PI * 2); g.stroke();
  g.lineWidth = S * 0.022;
  g.beginPath(); g.arc(cx, cy, S * 0.345, 0, Math.PI * 2); g.stroke();
  const u = S * 0.01;
  g.lineWidth = S * 0.05;
  switch (id) {
    case 'guard': { // cadeado
      g.beginPath(); g.arc(cx, cy - 4 * u, 9 * u, Math.PI, 0); g.stroke();
      g.fillRect(cx - 14 * u, cy - 4 * u, 28 * u, 22 * u);
      g.globalCompositeOperation = 'destination-out';
      g.beginPath(); g.arc(cx, cy + 4 * u, 3.6 * u, 0, Math.PI * 2); g.fill();
      g.fillRect(cx - 1.8 * u, cy + 4 * u, 3.6 * u, 8 * u);
      g.globalCompositeOperation = 'source-over';
      break;
    }
    case 'double': { // dois dominós sobrepostos
      g.lineWidth = S * 0.04;
      for (const [dx, dy] of [[-6, -5], [6, 5]]) {
        g.save();
        g.translate(cx + dx * u, cy + dy * u);
        g.rotate(-0.25);
        g.globalCompositeOperation = 'destination-out';
        g.fillRect(-8 * u, -15 * u, 16 * u, 30 * u);
        g.globalCompositeOperation = 'source-over';
        g.strokeRect(-8 * u, -15 * u, 16 * u, 30 * u);
        g.beginPath(); g.moveTo(-6 * u, 0); g.lineTo(6 * u, 0); g.stroke();
        g.beginPath(); g.arc(0, -7 * u, 2.6 * u, 0, Math.PI * 2); g.arc(0, 8 * u, 2.6 * u, 0, Math.PI * 2); g.fill();
        g.restore();
      }
      break;
    }
    case 'lucky': { // trevo de quatro folhas
      for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        g.beginPath(); g.arc(cx + dx * 7.5 * u, cy - 3 * u + dy * 7.5 * u, 8 * u, 0, Math.PI * 2); g.fill();
      }
      g.lineWidth = S * 0.04;
      g.beginPath(); g.moveTo(cx, cy + 4 * u); g.quadraticCurveTo(cx + 4 * u, cy + 16 * u, cx + 10 * u, cy + 21 * u); g.stroke();
      break;
    }
    case 'first': { // coroa
      g.beginPath();
      g.moveTo(cx - 17 * u, cy + 12 * u);
      g.lineTo(cx - 19 * u, cy - 10 * u);
      g.lineTo(cx - 8 * u, cy + 1 * u);
      g.lineTo(cx, cy - 16 * u);
      g.lineTo(cx + 8 * u, cy + 1 * u);
      g.lineTo(cx + 19 * u, cy - 10 * u);
      g.lineTo(cx + 17 * u, cy + 12 * u);
      g.closePath();
      g.fill();
      g.fillRect(cx - 17 * u, cy + 15 * u, 34 * u, 5 * u);
      break;
    }
    case 'gold': { // moeda com estrela
      g.lineWidth = S * 0.035;
      g.beginPath(); g.arc(cx, cy, 20 * u, 0, Math.PI * 2); g.stroke();
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = i % 2 ? 6 * u : 14 * u;
        g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      }
      g.closePath();
      g.fill();
      break;
    }
    case 'spring': { // mola em zigue-zague + arco do salto
      g.lineWidth = S * 0.04;
      g.beginPath();
      g.moveTo(cx - 12 * u, cy + 20 * u);
      for (let k = 0; k < 5; k++) g.lineTo(cx + (k % 2 ? -12 : 12) * u, cy + (14 - k * 6) * u);
      g.lineTo(cx - 12 * u, cy - 16 * u);
      g.stroke();
      g.lineWidth = S * 0.03;
      g.beginPath(); g.arc(cx, cy - 4 * u, 22 * u, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
      const ax = cx + Math.cos(Math.PI * 1.85) * 22 * u, ay = cy - 4 * u + Math.sin(Math.PI * 1.85) * 22 * u;
      g.beginPath(); g.moveTo(ax + 6 * u, ay + 1 * u); g.lineTo(ax - 4 * u, ay - 6 * u); g.lineTo(ax - 2 * u, ay + 6 * u); g.closePath(); g.fill();
      break;
    }
  }
  // tinta falhando: pontinhos e riscos apagados (sempre os mesmos para cada selo)
  const r = rnd(SEAL_ORDER.indexOf(id) * 977 + 13);
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 70; i++) {
    g.globalAlpha = 0.25 + r() * 0.6;
    g.beginPath();
    g.arc(ox + r() * S, oy + r() * S, S * (0.004 + r() * 0.012), 0, Math.PI * 2);
    g.fill();
  }
  g.globalAlpha = 0.85;
  for (let i = 0; i < 3; i++) {
    const a = r() * Math.PI * 2;
    g.lineWidth = S * 0.012;
    g.beginPath(); g.arc(cx, cy, S * 0.43, a, a + 0.12 + r() * 0.2); g.stroke();
  }
  g.restore();
}

const sealUrlCache = new Map<SealId, string>();
/** Imagem do selo para a interface. */
export function sealURL(id: SealId): string {
  const hit = sealUrlCache.get(id);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = 96;
  drawSeal(c.getContext('2d')!, id, 96);
  const url = c.toDataURL();
  sealUrlCache.set(id, url);
  return url;
}
export const sealImg = (id: SealId, cls = 'seal-ico') => `<img class="${cls}" src="${sealURL(id)}" alt="${SEALS[id].name}">`;

let atlas: THREE.CanvasTexture | null = null;
/** Atlas 3D: uma célula por selo, na ordem de SEAL_ORDER. */
export function sealAtlas(): THREE.CanvasTexture {
  if (atlas) return atlas;
  const S = 256;
  const c = document.createElement('canvas');
  c.width = S * SEAL_ORDER.length; c.height = S;
  const g = c.getContext('2d')!;
  SEAL_ORDER.forEach((id, i) => drawSeal(g, id, S, i * S, 0));
  atlas = new THREE.CanvasTexture(c);
  atlas.colorSpace = THREE.SRGBColorSpace;
  atlas.anisotropy = 8;
  return atlas;
}

// ---------- ícones das bênçãos ----------
function drawBuff(g: CanvasRenderingContext2D, id: BuffId, S: number) {
  const col = BUFFS[id].color;
  const cx = S / 2, cy = S / 2, u = S / 100;
  // ficha escura com aro
  const grd = g.createRadialGradient(cx, cy - 10 * u, 5 * u, cx, cy, 48 * u);
  grd.addColorStop(0, '#2a1d2c'); grd.addColorStop(1, '#0e0a10');
  g.fillStyle = grd;
  g.beginPath(); g.arc(cx, cy, 46 * u, 0, Math.PI * 2); g.fill();
  g.strokeStyle = col; g.lineWidth = 4 * u;
  g.globalAlpha = 0.9;
  g.beginPath(); g.arc(cx, cy, 43 * u, 0, Math.PI * 2); g.stroke();
  g.globalAlpha = 1;
  g.fillStyle = col; g.strokeStyle = col; g.lineCap = 'round'; g.lineJoin = 'round';
  g.shadowColor = col; g.shadowBlur = 10 * u;
  switch (id) {
    case 'bighand': // três dominós em leque
      for (const a of [-0.45, 0, 0.45]) {
        g.save(); g.translate(cx, cy + 22 * u); g.rotate(a);
        g.fillRect(-7 * u, -40 * u, 14 * u, 30 * u);
        g.restore();
      }
      break;
    case 'breath': // ampulheta
      g.lineWidth = 5 * u;
      g.beginPath();
      g.moveTo(cx - 16 * u, cy - 26 * u); g.lineTo(cx + 16 * u, cy - 26 * u); g.lineTo(cx - 14 * u, cy + 26 * u); g.lineTo(cx + 14 * u, cy + 26 * u);
      g.closePath(); g.stroke();
      g.beginPath(); g.moveTo(cx - 8 * u, cy + 22 * u); g.lineTo(cx + 8 * u, cy + 22 * u); g.lineTo(cx, cy + 8 * u); g.closePath(); g.fill();
      break;
    case 'vigor': // coração
      g.beginPath();
      g.moveTo(cx, cy + 24 * u);
      g.bezierCurveTo(cx - 34 * u, cy, cx - 22 * u, cy - 28 * u, cx, cy - 12 * u);
      g.bezierCurveTo(cx + 22 * u, cy - 28 * u, cx + 34 * u, cy, cx, cy + 24 * u);
      g.fill();
      break;
    case 'greed': // pilha de moedas
      for (let i = 0; i < 4; i++) {
        g.beginPath(); g.ellipse(cx, cy + 20 * u - i * 11 * u, 20 * u, 7 * u, 0, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#3a2a08'; g.lineWidth = 2 * u; g.stroke(); g.strokeStyle = col;
      }
      break;
    case 'seer': // olho
      g.lineWidth = 5 * u;
      g.beginPath(); g.moveTo(cx - 30 * u, cy); g.quadraticCurveTo(cx, cy - 26 * u, cx + 30 * u, cy); g.quadraticCurveTo(cx, cy + 26 * u, cx - 30 * u, cy); g.stroke();
      g.beginPath(); g.arc(cx, cy, 10 * u, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#0e0a10'; g.beginPath(); g.arc(cx, cy, 4 * u, 0, Math.PI * 2); g.fill();
      break;
    case 'recycle': // seta em círculo
      g.lineWidth = 6 * u;
      g.beginPath(); g.arc(cx, cy, 22 * u, -Math.PI * 0.15, Math.PI * 1.45); g.stroke();
      g.beginPath();
      const a = -Math.PI * 0.15, tx = cx + Math.cos(a) * 22 * u, ty = cy + Math.sin(a) * 22 * u;
      g.moveTo(tx + 9 * u, ty + 2 * u); g.lineTo(tx - 4 * u, ty - 10 * u); g.lineTo(tx - 6 * u, ty + 8 * u); g.closePath(); g.fill();
      break;
  }
}

const buffUrlCache = new Map<BuffId, string>();
export function buffURL(id: BuffId): string {
  const hit = buffUrlCache.get(id);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = 96;
  drawBuff(c.getContext('2d')!, id, 96);
  const url = c.toDataURL();
  buffUrlCache.set(id, url);
  return url;
}
export const buffImg = (id: BuffId, cls = 'buff-ico') => `<img class="${cls}" src="${buffURL(id)}" alt="${BUFFS[id].name}">`;
