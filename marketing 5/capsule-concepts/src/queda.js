// "A Queda": corrente de dominós em perspectiva 3D de verdade, tombando até derrubar o General.
// Traço chapado (sem sombra, gradiente ou grão) e fundos claros e quentes, que saltam do azul-marinho da Steam.
// ?v=<câmera> escolhe o enquadramento, ?p=<paleta> troca as cores.
import { INK, C, dominoFace, soldier, general, crownAlone, star4, logo, burst, sunburst } from './lib.js';

const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => mul(a, 1 / Math.hypot(...a));
const UP = [0, 1, 0];
const DH = 2, DT = 0.32; // dominó: altura 2, largura 1, espessura 0.32 (unidades do mundo)

function camera({ pos, target, f, cx, cy }) {
  const fw = norm(sub(target, pos)), rt = norm(cross(fw, UP)), up = cross(rt, fw);
  return {
    pos, f, fw,
    p(P) { const d = sub(P, pos), z = dot(d, fw); return [cx + (f * dot(d, rt)) / z, cy - (f * dot(d, up)) / z, z]; },
  };
}

/** Caminho no chão (Catmull-Rom em x/z), amostrado por comprimento. */
function path(pts) {
  const Q = [pts[0], ...pts, pts[pts.length - 1]], poly = [];
  const cr = (a, b, c, d, t) => [0, 1].map((k) => 0.5 * (2 * b[k] + (-a[k] + c[k]) * t + (2 * a[k] - 5 * b[k] + 4 * c[k] - d[k]) * t * t + (-a[k] + 3 * b[k] - 3 * c[k] + d[k]) * t * t * t));
  for (let i = 1; i < Q.length - 2; i++) for (let k = 0; k < 60; k++) poly.push(cr(Q[i - 1], Q[i], Q[i + 1], Q[i + 2], k / 60));
  poly.push(pts[pts.length - 1]);
  const L = [0];
  for (let i = 1; i < poly.length; i++) L.push(L[i - 1] + Math.hypot(poly[i][0] - poly[i - 1][0], poly[i][1] - poly[i - 1][1]));
  return {
    len: L[L.length - 1],
    at(s) {
      let i = 1;
      while (i < L.length - 1 && L[i] < s) i++;
      const a = poly[i - 1], b = poly[i], k = (s - L[i - 1]) / (L[i] - L[i - 1] || 1);
      return { p: [a[0] + (b[0] - a[0]) * k, 0, a[1] + (b[1] - a[1]) * k], t: norm([b[0] - a[0], 0, b[1] - a[1]]) };
    },
  };
}

/** Mapeia um retângulo local (0..w, 0..h) no quadrilátero projetado O→X (largura), O→Y (altura). */
const affine = (O, X, Y, w, h, inner) =>
  `<g transform="matrix(${(X[0] - O[0]) / w} ${(X[1] - O[1]) / w} ${(Y[0] - O[0]) / h} ${(Y[1] - O[1]) / h} ${O[0]} ${O[1]})">${inner}</g>`;

/** Dominó 3D: B = meio da aresta de baixo da face da frente, t = sentido da queda, phi = quanto já tombou. */
function piece(cam, B, t, phi, o) {
  const R = norm(cross(UP, t)), c = Math.cos(phi), s = Math.sin(phi);
  const W3 = (u, v, w) => add(add(add(B, mul(R, u)), mul(UP, v * c - w * s)), mul(t, w * c + v * s));
  const P = (u, v, w) => cam.p(W3(u, v, w));
  const nF = add(mul(UP, -s), mul(t, c)), nT = add(mul(UP, c), mul(t, s));
  const vis = (n, u, v, w) => dot(n, sub(cam.pos, W3(u, v, w))) > 0;
  const sw = 5.5, T = DT * 100;
  const slab = (w, h) => `<rect x="0" y="0" width="${w}" height="${h}" rx="7" fill="${o.side}" stroke="${o.ink}" stroke-width="${sw}" stroke-linejoin="round"/>`;
  const big = (show) => `<g transform="translate(50 196)">${dominoFace({ face: o.face, pip: o.pip, body: o.body, ink: o.ink, pipCol: o.pipCol, sw, showFace: show })}</g>`;
  let out = '';
  if (vis(nT, 0, DH, -DT / 2)) out += affine(P(-0.5, DH, 0), P(0.5, DH, 0), P(-0.5, DH, -DT), 100, T, slab(100, T));
  if (vis(R, 0.5, DH / 2, -DT / 2)) out += affine(P(0.5, DH, 0), P(0.5, DH, -DT), P(0.5, 0, 0), T, 196, slab(T, 196));
  if (vis(mul(R, -1), -0.5, DH / 2, -DT / 2)) out += affine(P(-0.5, DH, -DT), P(-0.5, DH, 0), P(-0.5, 0, -DT), T, 196, slab(T, 196));
  if (vis(nF, 0, DH / 2, 0)) out += affine(P(-0.5, DH, 0), P(0.5, DH, 0), P(-0.5, 0, 0), 100, 196, big(o.faceOn === 'front'));
  if (vis(mul(nF, -1), 0, DH / 2, -DT)) out += affine(P(0.5, DH, -DT), P(-0.5, DH, -DT), P(0.5, 0, -DT), 100, 196, big(o.faceOn === 'back'));
  return { z: cam.p(W3(0, DH / 2, -DT / 2))[2], svg: out, tip: W3(0, DH, 0) };
}

// paletas: céu, raios, chão, linhas do chão, letreiro (miolo/extrusão), impacto
export const PAL = {
  sol: { sky: '#ffd23f', ray: '#ffc01a', ground: '#ff8a3d', grid: '#ec7128', lFill: '#fff6e0', lExt: '#e8412c', boom: '#fff6e0', boom2: '#ff5b3a', body: '#fff8e8', side: '#f2d9a6' },
  tomate: { sky: '#ff5b3a', ray: '#ff7552', ground: '#ffd9a3', grid: '#f2bd7c', lFill: '#ffe28a', lExt: '#8a1a24', boom: '#ffe28a', boom2: '#fff6e0', body: '#fff8e8', side: '#f2d9a6' },
  menta: { sky: '#3fd9b5', ray: '#5ce6c6', ground: '#fff0cf', grid: '#ead4a4', lFill: '#ffe28a', lExt: '#e8412c', boom: '#ffe28a', boom2: '#ff5b3a', body: '#fffaf0', side: '#f2d9a6' },
  chiclete: { sky: '#ff7eb6', ray: '#ff97c5', ground: '#ffe08a', grid: '#f2c75c', lFill: '#fff6e0', lExt: '#7a1fa0', boom: '#fff6e0', boom2: '#ffe08a', body: '#fffaf0', side: '#f2d9a6' },
  creme: { sky: '#fff1d6', ray: '#ffe3b0', ground: '#e8412c', grid: '#c93222', lFill: '#e8412c', lExt: '#1c0f1e', boom: '#ffd23f', boom2: '#fff6e0', body: '#fffaf0', side: '#f2d9a6' },
  lima: { sky: '#c4f04a', ray: '#b2e43a', ground: '#ff9a5a', grid: '#ee7f3e', lFill: '#fff6e0', lExt: '#1f6b3a', boom: '#fff6e0', boom2: '#ffd23f', body: '#fffaf0', side: '#f2d9a6' },
};

// quanto cada peça já tombou, contando da peça que bate no General (0) para trás
const FALL = [30, 42, 51, 57, 61];
const FACES = ['evil', 'gleeful', 'scream', 'gleeful', 'determined', 'scream', 'happy', 'gleeful'];

// enquadramentos (mundo: General em 0,0,0; corrente chega pelo caminho até ele)
export const VARIANTS = {
  // 3/4 lateral: a corrente nasce grande na frente à esquerda e corre até o General
  a: { pal: 'sol', faceOn: 'back', path: [[-9, 8.5], [-6.5, 5.2], [-3.6, 2.4], [-1.3, 0.7]], cam: { pos: [-1.5, 3.3, 12.5], target: [-1.2, 0.9, 0.5], f: 1150, ox: 70, oy: 40 }, logo: { cx: 360, cy: 112, size: 128, tilt: 10, rot: -4 } },
  // do chão, na frente do General: as peças vêm do fundo e caem por cima dele, na nossa direção
  b: { pal: 'tomate', faceOn: 'front', boomMax: 95, sold: [[0.8, 1.6, 1.9, 60, 'dizzy', 'out'], [1.6, -1.5, 0.9, -40, 'scared', 'up'], [2.2, 0.6, 2.8, 120, 'dizzy', 'out'], [0.3, -2.4, 2.3, -75, 'scared', 'out']], path: [[-34, -16], [-18, -9], [-7, -3.2], [-1.4, -0.6]], cam: { pos: [4.4, 1.3, -2.6], target: [-4.5, 1.0, -2.2], f: 860, ox: 250, oy: 50 }, gen: 0.9, logo: { cx: 380, cy: 104, size: 120, tilt: 8, rot: -3 } },
  // vista do alto: corrente em S, General caindo cercado pelo pelotão
  c: { pal: 'menta', faceOn: 'back', path: [[-12, 7], [-8, 1], [-3.5, 4.2], [-1.2, 0.9]], cam: { pos: [-1, 15, 9.5], target: [-4.6, 0, 2.2], f: 1180, ox: -70, oy: 30 }, logo: { cx: 616, cy: 96, size: 120, tilt: 6, rot: 0 } },
  // atrás da corrente: fileira até o ponto de fuga, onde o General gigante leva o tranco
  d: { pal: 'chiclete', faceOn: 'back', path: [[2.6, 9.5], [-1.6, 4], [1.8, -3], [-0.2, -9.2]], cam: { pos: [1.7, 2.9, 13], target: [-0.3, 1.1, -6], f: 980, ox: 0, oy: 60 }, gen: 2.4, logo: { cx: 616, cy: 96, size: 124, tilt: 6, rot: 0 } },
  // close de baixo: a última peça desaba sobre o General, câmera quase no chão
  e: { pal: 'lima', faceOn: 'front', path: [[-24, -13], [-12, -8], [-5, -3.6], [-1.3, -0.75]], cam: { pos: [-1.3, 0.35, 2.5], target: [-0.8, 1.5, -0.4], f: 700, ox: 0, oy: 20 }, gen: 0.85, logo: { cx: 360, cy: 104, size: 122, tilt: 8, rot: -4 } },
  // espiral vista de cima: a corrente gira em volta do General e fecha nele
  f: { pal: 'creme', faceOn: 'back', path: Array.from({ length: 12 }, (_, i) => { const a = 0.6 + i * 0.62, r = 10.5 - i * 0.8; return [Math.cos(a) * r, Math.sin(a) * r]; }), cam: { pos: [0, 19, 9], target: [0.4, 0, -0.6], f: 1050, ox: 0, oy: 40 }, gen: 1.5, logo: { cx: 616, cy: 92, size: 116, tilt: 6, rot: 0 } },
};

export function queda(svg, W, H, q) {
  const V = VARIANTS[q.get('v') || 'a'], P = PAL[q.get('p') || V.pal];
  const cam = camera({ ...V.cam, cx: W / 2 + (V.cam.ox || 0), cy: H / 2 + (V.cam.oy || 0) });
  const pa = path(V.path), gap = 1.05;
  const items = [];
  // peças, da que bate no General para trás
  const n = Math.floor(pa.len / gap) + 1;
  let first;
  for (let k = 0; k < n; k++) {
    const { p, t } = pa.at(pa.len - k * gap);
    const pc = piece(cam, p, t, (FALL[Math.min(k, FALL.length - 1)] * Math.PI) / 180, {
      faceOn: V.faceOn, face: FACES[k % FACES.length], pip: (k * 5 + 2) % 7, body: P.body, side: P.side, ink: INK, pipCol: INK,
    });
    if (pc.z > 0.6) items.push(pc);
    if (k === 0) first = { p, t, tip: pc.tip };
  }
  // General levando o tranco, um pouco à frente da última peça
  const gS = V.gen || 1.25, G = add(first.p, mul(first.t, 1.25 + 0.25 * gS));
  const R = norm(cross(UP, first.t));
  const scr = (Pw) => cam.p(Pw);
  const [gx, gy, gz] = scr(G), dirX = Math.sign(scr(add(G, first.t))[0] - gx) || 1;
  const px = (z) => cam.f / z; // pixels por unidade do mundo nessa profundidade
  items.push({ z: gz, svg: general({ x: gx, y: gy, s: (px(gz) * 2.5 * gS) / 205, rot: dirX * 28, mood: 'shock', crown: false }) });
  const [cx, cy, cz] = scr(add(G, [0, 3.4 * gS, 0]));
  items.push({ z: cz - 0.5, svg: crownAlone({ x: cx + dirX * 0.9 * px(cz) * gS, y: cy, s: (px(cz) * 0.9 * gS) / 52, rot: dirX * 30 }) });
  // pelotão voando para longe
  const SOLD = V.sold || [[0.8, 1.6, 1.9, 60, 'dizzy', 'out'], [1.6, -1.5, 0.9, -40, 'scared', 'up'], [-0.4, 2.3, 0.0, 12, 'scared', 'up'], [2.2, 0.6, 2.8, 120, 'dizzy', 'out'], [0.3, -2.4, 2.3, -75, 'scared', 'out']];
  SOLD.forEach(([a, r, h, rot, mood, arms], i) => {
    const Pw = add(add(G, mul(first.t, a * gS)), add(mul(R, r * gS), [0, h * gS, 0]));
    const [x, y, z] = scr(Pw);
    if (z > gz * 0.75) items.push({ z, svg: soldier({ x, y, s: (px(z) * 1.45 * gS) / 170, rot: dirX * rot, mood, arms, flip: i % 2 === 0 }) });
  });
  // estrela do impacto, atrás de quem está no ponto de contato
  const [ix, iy, iz] = scr(add(first.tip, [0, -0.15, 0]));
  const bR = Math.min(px(iz), V.boomMax || 150); // perto da câmera a estrela não pode engolir a cena
  items.push({ z: Math.max(iz, gz) + 0.4, svg: burst(ix, iy, bR * 0.9, bR * 1.9, 11, P.boom, INK, 5, 5, 0.2) + burst(ix, iy, bR * 0.45, bR * 0.95, 9, P.boom2, INK, 4, 9, 0.5) });

  // fundo: céu chapado com raios saindo do impacto, chão com quadriculado em perspectiva
  let o = `<rect width="${W}" height="${H}" fill="${P.sky}"/>` + sunburst(ix, iy, 3000, 22, P.ray, 1, 0.1);
  const hz = norm([cam.fw[0], 0, cam.fw[2]]), hy = scr(add(cam.pos, mul(hz, 1e5)))[1];
  o += `<rect x="0" y="${Math.max(hy, -10)}" width="${W}" height="${H + 20}" fill="${P.ground}"/>`;
  o += `<line x1="0" y1="${hy}" x2="${W}" y2="${hy}" stroke="${INK}" stroke-width="5"/>`;
  let grid = '';
  const line = (A, B) => {
    let d = '', pen = false;
    for (let i = 0; i <= 120; i++) {
      const Pw = add(A, mul(sub(B, A), i / 120)), [x, y, z] = scr(Pw);
      if (z < 0.4) { pen = false; continue; }
      d += `${pen ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)} `; pen = true;
    }
    return d;
  };
  for (let k = -40; k <= 40; k += 2.1) { grid += line([k, 0, -80], [k, 0, 40]) + line([-80, 0, k], [40, 0, k]); }
  o += `<path d="${grid}" stroke="${P.grid}" stroke-width="3" fill="none"/>`;
  o += items.sort((a, b) => b.z - a.z).map((i) => i.svg).join('');
  // brilhos e marcas de movimento perto do impacto
  const r = bR;
  o += star4(ix - dirX * r * 1.5, iy - r * 1.3, r * 0.32, '#fff') + star4(ix + dirX * r * 2.3, iy - r * 0.4, r * 0.22, '#fff', 20) + star4(ix - dirX * r * 0.4, iy + r * 1.7, r * 0.18, '#fff');
  o += `<g stroke="${INK}" stroke-width="${Math.max(3, r * 0.06)}" stroke-linecap="round" fill="none">${[-0.55, 0, 0.55].map((a) => {
    const ang = Math.atan2(-1, -dirX) + a, r0 = r * 2.05, r1 = r * 2.55;
    return `<path d="M${ix + Math.cos(ang) * r0} ${iy + Math.sin(ang) * r0} L${ix + Math.cos(ang) * r1} ${iy + Math.sin(ang) * r1}"/>`;
  }).join('')}</g>`;
  svg.innerHTML = o;
  logo(svg, { ...V.logo, maxW: 640, fill: P.lFill, ext: P.lExt, ink: INK, shine: false });
}
