// Estilos artísticos aplicados por cima da arte renderizada (canvas, pixel a pixel).
// Cada estilo recebe o ImageData da arte original (e a máscara 0..1 do traço preto) e devolve um ImageData novo.

const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);

function hash(ix, iy, seed) {
  let h = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 982451653);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, y, seed = 1) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy, seed), b = hash(ix + 1, iy, seed), c = hash(ix, iy + 1, seed), d = hash(ix + 1, iy + 1, seed);
  return mix(mix(a, b, u), mix(c, d, u), v);
}
function fbm(x, y, seed = 1, oct = 4) {
  let s = 0, a = 0.5, n = 0;
  for (let i = 0; i < oct; i++) { s += a * vnoise(x, y, seed + i * 17); n += a; x *= 2.03; y *= 2.03; a *= 0.5; }
  return s / n;
}

/** ImageData -> canais float 0..1 */
function split(img) {
  const n = img.width * img.height, R = new Float32Array(n), G = new Float32Array(n), B = new Float32Array(n), L = new Float32Array(n);
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    R[i] = img.data[p] / 255; G[i] = img.data[p + 1] / 255; B[i] = img.data[p + 2] / 255;
    L[i] = 0.299 * R[i] + 0.587 * G[i] + 0.114 * B[i];
  }
  return { R, G, B, L };
}
function join(W, H, R, G, B) {
  const out = new ImageData(W, H);
  for (let i = 0, p = 0; i < W * H; i++, p += 4) {
    out.data[p] = clamp(R[i]) * 255; out.data[p + 1] = clamp(G[i]) * 255; out.data[p + 2] = clamp(B[i]) * 255; out.data[p + 3] = 255;
  }
  return out;
}
/** amostra bilinear de um canal */
function samp(ch, W, H, x, y) {
  x = clamp(x, 0, W - 1.001); y = clamp(y, 0, H - 1.001);
  const ix = x | 0, iy = y | 0, fx = x - ix, fy = y - iy, i = iy * W + ix;
  return mix(mix(ch[i], ch[i + 1], fx), mix(ch[i + W], ch[i + W + 1], fx), fy);
}
/** desfoque quase gaussiano (3 passadas de caixa) */
function blur(ch, W, H, r) {
  if (r < 1) return ch.slice();
  let a = ch.slice(), b = new Float32Array(ch.length);
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < H; y++) {
      let acc = 0; const row = y * W;
      for (let x = -r; x <= r; x++) acc += a[row + clamp(x, 0, W - 1)];
      for (let x = 0; x < W; x++) {
        b[row + x] = acc / (2 * r + 1);
        acc += a[row + Math.min(x + r + 1, W - 1)] - a[row + Math.max(x - r, 0)];
      }
    }
    for (let x = 0; x < W; x++) {
      let acc = 0;
      for (let y = -r; y <= r; y++) acc += b[clamp(y, 0, H - 1) * W + x];
      for (let y = 0; y < H; y++) {
        a[y * W + x] = acc / (2 * r + 1);
        acc += b[Math.min(y + r + 1, H - 1) * W + x] - b[Math.max(y - r, 0) * W + x];
      }
    }
  }
  return a;
}
/** filtro de Kuwahara (vira "pinceladas" chapadas), com tabelas de soma */
function kuwahara(R, G, B, W, H, r) {
  const sat = (f) => {
    const s = new Float64Array((W + 1) * (H + 1));
    for (let y = 0; y < H; y++) {
      let row = 0;
      for (let x = 0; x < W; x++) { row += f(y * W + x); s[(y + 1) * (W + 1) + x + 1] = s[y * (W + 1) + x + 1] + row; }
    }
    return s;
  };
  const L = (i) => 0.299 * R[i] + 0.587 * G[i] + 0.114 * B[i];
  const SR = sat((i) => R[i]), SG = sat((i) => G[i]), SB = sat((i) => B[i]), SL = sat(L), SL2 = sat((i) => L(i) ** 2);
  const box = (s, x0, y0, x1, y1) => s[(y1 + 1) * (W + 1) + x1 + 1] - s[y0 * (W + 1) + x1 + 1] - s[(y1 + 1) * (W + 1) + x0] + s[y0 * (W + 1) + x0];
  const oR = new Float32Array(W * H), oG = new Float32Array(W * H), oB = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let best = Infinity, br = 0, bg = 0, bb = 0;
    for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const x0 = clamp(dx < 0 ? x - r : x, 0, W - 1), x1 = clamp(dx < 0 ? x : x + r, 0, W - 1);
      const y0 = clamp(dy < 0 ? y - r : y, 0, H - 1), y1 = clamp(dy < 0 ? y : y + r, 0, H - 1);
      const n = (x1 - x0 + 1) * (y1 - y0 + 1), m = box(SL, x0, y0, x1, y1) / n, v = box(SL2, x0, y0, x1, y1) / n - m * m;
      if (v < best) { best = v; br = box(SR, x0, y0, x1, y1) / n; bg = box(SG, x0, y0, x1, y1) / n; bb = box(SB, x0, y0, x1, y1) / n; }
    }
    const i = y * W + x; oR[i] = br; oG[i] = bg; oB[i] = bb;
  }
  return { R: oR, G: oG, B: oB };
}
/** k-means simples de cores (em amostras) */
function kmeans(R, G, B, k, iters = 12, step = 7) {
  const pts = [];
  for (let i = 0; i < R.length; i += step) pts.push([R[i], G[i], B[i]]);
  pts.sort((a, b) => (a[0] + a[1] + a[2]) - (b[0] + b[1] + b[2]));
  let cs = Array.from({ length: k }, (_, j) => pts[Math.floor((j + 0.5) / k * pts.length)].slice());
  for (let it = 0; it < iters; it++) {
    const acc = cs.map(() => [0, 0, 0, 0]);
    for (const p of pts) { const j = nearest(cs, p[0], p[1], p[2]); acc[j][0] += p[0]; acc[j][1] += p[1]; acc[j][2] += p[2]; acc[j][3]++; }
    cs = cs.map((c, j) => (acc[j][3] ? [acc[j][0] / acc[j][3], acc[j][1] / acc[j][3], acc[j][2] / acc[j][3]] : c));
  }
  return cs;
}
function nearest(cs, r, g, b) {
  let best = Infinity, bj = 0;
  for (let j = 0; j < cs.length; j++) {
    const dr = cs[j][0] - r, dg = cs[j][1] - g, db = cs[j][2] - b, d = 0.3 * dr * dr + 0.59 * dg * dg + 0.11 * db * db;
    if (d < best) { best = d; bj = j; }
  }
  return bj;
}
function satur(r, g, b) { const mx = Math.max(r, g, b), mn = Math.min(r, g, b); return mx ? (mx - mn) / mx : 0; }

export const STYLES = {
  // Aquarela: tinta diluída que vaza, granulação do pigmento, borda escura das poças e traço de lápis por cima
  aquarela(img, W, H, ink) {
    const S = split(img), n = W * H;
    // pintura deslocada (a tinta não respeita a linha)
    const dR = new Float32Array(n), dG = new Float32Array(n), dB = new Float32Array(n);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, ox = (fbm(x / 45, y / 45, 3) - 0.5) * 16, oy = (fbm(x / 45, y / 45, 9) - 0.5) * 16;
      dR[i] = samp(S.R, W, H, x + ox, y + oy); dG[i] = samp(S.G, W, H, x + ox, y + oy); dB[i] = samp(S.B, W, H, x + ox, y + oy);
    }
    // o traço preto vira "branco" na camada de tinta (lápis vem depois)
    for (let i = 0; i < n; i++) {
      const l = 0.3 * dR[i] + 0.59 * dG[i] + 0.11 * dB[i];
      if (l < 0.13) { dR[i] = mix(dR[i], 0.32, 0.6); dG[i] = mix(dG[i], 0.18, 0.6); dB[i] = mix(dB[i], 0.42, 0.6); }
    }
    const K = kuwahara(dR, dG, dB, W, H, 4);
    const bR = blur(K.R, W, H, 6), bG = blur(K.G, W, H, 6), bB = blur(K.B, W, H, 6);
    const inkB = blur(ink, W, H, 1);
    const paper = hex('#f8f2e2'), pencil = hex('#3b2633');
    const R = new Float32Array(n), G = new Float32Array(n), B = new Float32Array(n);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const gran = 0.72 + 0.5 * fbm(x / 3.2, y / 3.2, 21, 3);
      const edge = 1 + 2.2 * Math.abs((K.R[i] + K.G[i] + K.B[i]) - (bR[i] + bG[i] + bB[i])) / 3;
      const bloom = sstep(0.62, 0.8, fbm(x / 90, y / 90, 5)) * 0.35; // manchas onde a água lavou a tinta
      const pTex = 0.94 + 0.06 * fbm(x / 1.6, y / 1.6, 31, 2);
      const ch = [K.R[i], K.G[i], K.B[i]].map((c, k) => {
        const a = clamp((1 - c) * 0.9 * gran * edge * (1 - bloom));
        return paper[k] * pTex * (1 - a) + 0.02;
      });
      // lápis: falha às vezes, mais fino
      const pm = clamp(inkB[i] * (0.55 + 0.45 * fbm(x / 6, y / 6, 41, 2)) * 0.85);
      R[i] = mix(ch[0], pencil[0], pm); G[i] = mix(ch[1], pencil[1], pm); B[i] = mix(ch[2], pencil[2], pm);
    }
    return join(W, H, R, G, B);
  },

  // Óleo sobre tela: pinceladas (Kuwahara), relevo de tinta grossa iluminado, trama da tela e verniz
  oleo(img, W, H) {
    const S = split(img), n = W * H;
    const K = kuwahara(S.R, S.G, S.B, W, H, 4);
    const K2 = kuwahara(K.R, K.G, K.B, W, H, 2);
    const Lb = blur(S.L, W, H, 10);
    const h = new Float32Array(n);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const gx = Lb[y * W + Math.min(x + 1, W - 1)] - Lb[y * W + Math.max(x - 1, 0)];
      const gy = Lb[Math.min(y + 1, H - 1) * W + x] - Lb[Math.max(y - 1, 0) * W + x];
      // a pincelada corre ao longo das bordas; onde não há borda, segue uma direção que varia devagar
      let ang = Math.atan2(gy, gx) + Math.PI / 2;
      const gm = Math.hypot(gx, gy);
      const free = 0.5 + (fbm(x / 260, y / 260, 7) - 0.5) * 1.2; // fundo: pinceladas quase paralelas
      ang = gm > 0.006 ? ang : free;
      const ca = Math.cos(ang), sa = Math.sin(ang), u = x * ca + y * sa, v = -x * sa + y * ca;
      h[i] = 0.4 * fbm(u / 18, v / 2.6, 11, 3) + 0.6 * (0.3 * K2.R[i] + 0.59 * K2.G[i] + 0.11 * K2.B[i]);
    }
    const hb = blur(h, W, H, 1);
    const R = new Float32Array(n), G = new Float32Array(n), B = new Float32Array(n);
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      const sh = (hb[i - W - 1] - hb[i + W + 1]) * 3.2; // luz de cima à esquerda
      const spec = Math.max(0, sh) ** 2 * 1.2;
      const weave = 1 + 0.035 * Math.sin(x * 1.9) * Math.sin(y * 1.9);
      R[i] = (K2.R[i] * (1 + sh) + spec) * weave * 1.03;
      G[i] = (K2.G[i] * (1 + sh) + spec) * weave * 1.0;
      B[i] = (K2.B[i] * (1 + sh) + spec * 0.85) * weave * 0.9;
    }
    return join(W, H, R, G, B);
  },

  // Pixel art 16-bit: resolução baixa, paleta reduzida tirada da própria arte, contorno preservado, pontilhado
  pixel(img, W, H) {
    const S = split(img), f = 4, w = Math.ceil(W / f), h = Math.ceil(H / f);
    const sR = new Float32Array(w * h), sG = new Float32Array(w * h), sB = new Float32Array(w * h);
    for (let by = 0; by < h; by++) for (let bx = 0; bx < w; bx++) {
      let r = 0, g = 0, b = 0, c = 0, ink = 0, ir = 0, ig = 0, ib = 0;
      for (let y = by * f; y < Math.min(by * f + f, H); y++) for (let x = bx * f; x < Math.min(bx * f + f, W); x++) {
        const i = y * W + x;
        if (S.L[i] < 0.16) { ink++; ir += S.R[i]; ig += S.G[i]; ib += S.B[i]; } else { r += S.R[i]; g += S.G[i]; b += S.B[i]; c++; }
      }
      const j = by * w + bx;
      if (ink >= 5 || !c) { sR[j] = ir / ink; sG[j] = ig / ink; sB[j] = ib / ink; } else { sR[j] = r / c; sG[j] = g / c; sB[j] = b / c; }
    }
    // cores pequenas (vermelho dos soldados, olhos, coroa) somem no k-means: entram fixas
    const pal = kmeans(sR, sG, sB, 18, 14, 3).concat(['#c8392d', '#ee8a78', '#f0b64a', '#22294d', '#ffffff'].map(hex));
    const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
    const out = new ImageData(W, H);
    for (let by = 0; by < h; by++) for (let bx = 0; bx < w; bx++) {
      const j = by * w + bx, d = (bayer[(by % 4) * 4 + (bx % 4)] / 16 - 0.47) * 0.09;
      const c = pal[nearest(pal, sR[j] + d, sG[j] + d, sB[j] + d)];
      for (let y = by * f; y < Math.min(by * f + f, H); y++) for (let x = bx * f; x < Math.min(bx * f + f, W); x++) {
        const p = (y * W + x) * 4;
        out.data[p] = c[0] * 255; out.data[p + 1] = c[1] * 255; out.data[p + 2] = c[2] * 255; out.data[p + 3] = 255;
      }
    }
    return out;
  },

  // Risografia: três tintas (azul, rosa flúor, amarelo) em retícula, fora de registro, sobre papel
  riso(img, W, H) {
    const S = split(img), n = W * H, paper = hex('#f3ecdc');
    const inks = [
      { col: hex('#2f56b0'), ch: (i) => 1 - S.R[i], ang: 15, off: [2.5, -1.5] },
      { col: hex('#ff4fa8'), ch: (i) => 1 - S.G[i], ang: 75, off: [-2, 2] },
      // sem amarelo onde azul e rosa já cobrem (senão o roxo vira marrom)
      { col: hex('#ffe23a'), ch: (i) => 1 - S.B[i] - 0.75 * Math.min(1 - S.R[i], 1 - S.G[i]) * sstep(0.5, 0.2, S.B[i] - 0.5 * S.R[i]), ang: 0, off: [1, 2.5] },
    ];
    const R = new Float32Array(n).fill(paper[0]), G = new Float32Array(n).fill(paper[1]), B = new Float32Array(n).fill(paper[2]);
    const dens = inks.map((k) => { const a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = k.ch(i); return blur(a, W, H, 1); });
    const cell = 5.5;
    inks.forEach((k, ki) => {
      const ca = Math.cos(k.ang * Math.PI / 180), sa = Math.sin(k.ang * Math.PI / 180);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const d = clamp(samp(dens[ki], W, H, x - k.off[0], y - k.off[1]) * 1.05 - 0.04);
        const u = (x * ca + y * sa) / cell, v = (-x * sa + y * ca) / cell;
        const fu = u - Math.floor(u) - 0.5, fv = v - Math.floor(v) - 0.5, r = Math.hypot(fu, fv);
        const rad = Math.sqrt(d) * 0.72;
        let cov = sstep(rad + 0.06, rad - 0.06, r);
        cov *= 0.82 + 0.18 * fbm(x / 2, y / 2, 50 + ki, 2); // tinta irregular do riso
        cov *= 1 - 0.25 * sstep(0.7, 0.9, fbm(x / 70, y / 9, 60 + ki)); // faixas de rolo
        R[i] *= mix(1, k.col[0], cov); G[i] *= mix(1, k.col[1], cov); B[i] *= mix(1, k.col[2], cov);
      }
    });
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, g = 0.96 + 0.04 * hash(x, y, 77);
      R[i] *= g; G[i] *= g; B[i] *= g;
    }
    return join(W, H, R, G, B);
  },

  // Xilogravura / linóleo: preto, vermelho e papel; sulcos de goiva em volta do impacto, tinta falhada
  xilo(img, W, H) {
    const S = split(img), n = W * H, cx = 830, cy = 330;
    const paper = hex('#efe5cf'), black = hex('#17110f'), red = hex('#c2352b');
    const L = blur(S.L, W, H, 1);
    const R = new Float32Array(n), G = new Float32Array(n), B = new Float32Array(n);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const wx = x + (fbm(x / 30, y / 30, 2) - 0.5) * 3, wy = y + (fbm(x / 30, y / 30, 4) - 0.5) * 3;
      const l = samp(L, W, H, wx, wy), r0 = samp(S.R, W, H, wx, wy), g0 = samp(S.G, W, H, wx, wy), b0 = samp(S.B, W, H, wx, wy);
      const s = satur(r0, g0, b0), dark = 1 - l;
      // sulcos concêntricos em volta do impacto, linhas paralelas no resto
      const dist = Math.hypot(x - cx, y - cy), ang = Math.atan2(y - cy, x - cx);
      const wob = (fbm(ang * 6, dist / 80, 8) - 0.5) * 3;
      const stripe = Math.abs(((dist + wob) / 7.5) % 1 - 0.5) * 2; // 0 no meio do sulco
      let c = paper;
      const line = l < 0.16;
      if (line) c = black;
      else if (dark > 0.62) c = stripe < 0.22 + (1 - dark) * 0.9 ? paper : black; // fundo escuro com goivadas
      else if (s > 0.3 && l < 0.85) c = (l > 0.62 && stripe < (l - 0.62) * 2.6) ? paper : red;
      else if (l < 0.78) {
        const hatch = Math.abs(((x + y) / 6) % 1 - 0.5) * 2;
        c = hatch < (0.78 - l) * 2.2 ? black : paper;
      }
      // tinta falhada no bloco e textura do papel
      let k = 1;
      if (c !== paper) k = 1 - 0.85 * sstep(0.68, 0.8, fbm(x / 2.5, y / 2.5, 90, 3)) * (line ? 0.3 : 1);
      const pt = 0.95 + 0.05 * fbm(x / 1.5, y / 1.5, 95, 2);
      R[i] = mix(paper[0], c[0], k) * pt; G[i] = mix(paper[1], c[1], k) * pt; B[i] = mix(paper[2], c[2], k) * pt;
    }
    return join(W, H, R, G, B);
  },

  // Neon: os contornos viram tubos de luz da cor de cada forma, sobre uma parede escura
  neon(img, W, H, ink) {
    const S = split(img), n = W * H;
    const m = ink.slice(), wR = new Float32Array(n), wG = new Float32Array(n), wB = new Float32Array(n), wt = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const w = (1 - m[i]) * sstep(0.1, 0.2, S.L[i]); // a cor do tubo vem das formas claras vizinhas
      wR[i] = S.R[i] * w; wG[i] = S.G[i] * w; wB[i] = S.B[i] * w; wt[i] = w;
    }
    const r = 7, cR = blur(wR, W, H, r), cG = blur(wG, W, H, r), cB = blur(wB, W, H, r), cW = blur(wt, W, H, r);
    const tR = new Float32Array(n), tG = new Float32Array(n), tB = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let a = cR[i] / (cW[i] + 1e-4), b = cG[i] / (cW[i] + 1e-4), c = cB[i] / (cW[i] + 1e-4);
      // a cor do tubo: mesma matiz, saturada e no brilho máximo
      const mx = Math.max(a, b, c, 1e-3), mn = Math.min(a, b, c);
      a = (a - mn) / (mx - mn + 1e-3); b = (b - mn) / (mx - mn + 1e-3); c = (c - mn) / (mx - mn + 1e-3);
      const sat = satur(cR[i], cG[i], cB[i]) < 0.18 ? 0 : 1; // creme/branco viram tubo branco-quente
      a = mix(1, a, sat * 0.9); b = mix(0.95, b, sat * 0.9); c = mix(0.85, c, sat * 0.9);
      tR[i] = a * m[i]; tG[i] = b * m[i]; tB[i] = c * m[i];
    }
    const core = blur(m, W, H, 1);
    const g1 = [blur(tR, W, H, 4), blur(tG, W, H, 4), blur(tB, W, H, 4)];
    const g2 = [blur(tR, W, H, 16), blur(tG, W, H, 16), blur(tB, W, H, 16)];
    const R = new Float32Array(n), G = new Float32Array(n), B = new Float32Array(n);
    const wall = hex('#0b0714');
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      // parede de tijolo bem apagada
      const row = Math.floor(y / 26), bx = (x + (row % 2) * 30) % 60, by = y % 26;
      const mortar = bx < 3 || by < 3 ? 0.55 : 1;
      const wv = (0.85 + 0.3 * fbm(x / 40, y / 40, 3)) * mortar;
      const fill = 0.08 * (1 - m[i]);
      const hot = sstep(0.75, 1, core[i]) * 0.85;
      const t = [tR[i], tG[i], tB[i]];
      R[i] = wall[0] * wv + S.R[i] * fill + t[0] * 0.9 + g1[0][i] * 1.1 + g2[0][i] * 1.4 + hot;
      G[i] = wall[1] * wv + S.G[i] * fill + t[1] * 0.9 + g1[1][i] * 1.1 + g2[1][i] * 1.4 + hot;
      B[i] = wall[2] * wv + S.B[i] * fill + t[2] * 0.9 + g1[2][i] * 1.1 + g2[2][i] * 1.4 + hot;
    }
    return join(W, H, R, G, B);
  },

  // Giz na lousa: contornos em giz branco, preenchimento colorido rabiscado, lousa com marcas de apagador
  giz(img, W, H, ink) {
    const S = split(img), n = W * H, board = hex('#20372f'), chalk = hex('#f1efe6');
    const R = new Float32Array(n), G = new Float32Array(n), B = new Float32Array(n);
    const inkB = blur(ink, W, H, 1);
    const ca = Math.cos(0.6), sa = Math.sin(0.6);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const smudge = 0.8 + 0.35 * fbm(x / 120, y / 60, 2) + 0.12 * sstep(0.6, 0.8, fbm(x / 300, y / 22, 6));
      let r = board[0] * smudge, g = board[1] * smudge, b = board[2] * smudge;
      const ox = (fbm(x / 25, y / 25, 9) - 0.5) * 6, oy = (fbm(x / 25, y / 25, 13) - 0.5) * 6;
      const sr = samp(S.R, W, H, x + ox, y + oy), sg = samp(S.G, W, H, x + ox, y + oy), sb = samp(S.B, W, H, x + ox, y + oy);
      const l = 0.3 * sr + 0.59 * sg + 0.11 * sb;
      // rabisco: traços diagonais com falhas (o giz pega só no alto da textura da lousa)
      const u = x * ca + y * sa, v = -x * sa + y * ca;
      const strokes = 0.5 * fbm(u / 1.4, v / 16, 21, 3) + 0.5 * fbm(u / 3, v / 30, 23, 2), grit = hash(x, y, 33);
      const amt = sstep(0.28, 0.7, l) * 0.9;
      const cov = sstep(0.62 - amt * 0.45, 0.68 - amt * 0.45, strokes) * (grit > 0.1 ? 1 : 0.5) * amt;
      const pc = [sr, sg, sb].map((c) => mix(c, 1, 0.25)); // giz é pastel
      r = mix(r, pc[0], cov); g = mix(g, pc[1], cov); b = mix(b, pc[2], cov);
      const lc = clamp(inkB[i] * (grit > 0.1 ? 1 : 0.4) * (0.6 + 0.5 * fbm(x / 5, y / 5, 44, 2)));
      R[i] = mix(r, chalk[0], lc); G[i] = mix(g, chalk[1], lc); B[i] = mix(b, chalk[2], lc);
    }
    return join(W, H, R, G, B);
  },

  // Papel recortado em camadas: cores viram folhas cortadas à mão, empilhadas com sombra entre elas
  papel(img, W, H) {
    const S = split(img), n = W * H;
    const K = kuwahara(S.R, S.G, S.B, W, H, 2);
    const pal = kmeans(K.R, K.G, K.B, 10, 14, 5);
    const order = pal.map((c, j) => [0.3 * c[0] + 0.59 * c[1] + 0.11 * c[2], j]).sort((a, b) => a[0] - b[0]);
    const height = new Array(pal.length);
    order.forEach(([, j], rank) => { height[j] = rank; });
    const lab = new Uint8Array(n);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const ox = (fbm(x / 22, y / 22, 5) - 0.5) * 5, oy = (fbm(x / 22, y / 22, 8) - 0.5) * 5; // corte à mão
      lab[y * W + x] = nearest(pal, samp(K.R, W, H, x + ox, y + oy), samp(K.G, W, H, x + ox, y + oy), samp(K.B, W, H, x + ox, y + oy));
    }
    const hgt = new Float32Array(n);
    for (let i = 0; i < n; i++) hgt[i] = height[lab[i]];
    const shadow = new Float32Array(n), lift = new Float32Array(n);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      let s = 0;
      for (let k = 2; k <= 9; k += 1) {
        const xx = x - k, yy = y - k;
        if (xx < 0 || yy < 0) break;
        const d = hgt[yy * W + xx] - hgt[i];
        if (d > 0) { s = Math.max(s, Math.min(1, d / 3) * (1 - k / 11)); }
      }
      shadow[i] = s;
      const xa = Math.min(x + 1, W - 1), ya = Math.min(y + 1, H - 1);
      lift[i] = hgt[ya * W + xa] < hgt[i] ? 1 : 0; // borda iluminada do corte
    }
    const sb = blur(shadow, W, H, 3), lb = blur(lift, W, H, 1);
    const R = new Float32Array(n), G = new Float32Array(n), B = new Float32Array(n);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, c = pal[lab[i]], j = lab[i];
      const fiber = 0.92 + 0.08 * fbm(x / 2 + j * 37, y / 9 + j * 11, 70 + j, 3) + 0.03 * (hash(x, y, j) - 0.5);
      const k = fiber * (1 - 0.55 * sb[i]) + 0.12 * lb[i] * (1 - sb[i]);
      R[i] = c[0] * k; G[i] = c[1] * k; B[i] = c[2] * k;
    }
    return join(W, H, R, G, B);
  },
};
