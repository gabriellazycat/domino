// Variações do conceito 5 (pôster retrô da espiral). ?v=<nome> escolhe a variação.
import { C, domino, dominoTop, soldier, general, defs, grain, sunburst, star4, logo } from './lib.js';

const PAL = {
  classico: { bg: '#f2e4c2', ray: '#e6d2a6', circle: '#c2362c', ring: '#f2e4c2', ink: '#1f2747', body: '#fbf3df', side: '#d8c39a', pip: '#c2362c', lFill: '#c2362c', lExt: '#1f2747', lInk: '#1f2747', coat: '#c2362c' },
  noturno: { bg: '#1b2140', ray: '#232a52', circle: '#c2362c', ring: '#f0b64a', ink: '#0d1026', body: '#fbf3df', side: '#cdb68e', pip: '#c2362c', lFill: '#fbf3df', lExt: '#c2362c', lInk: '#0d1026', coat: '#c2362c', glow: '#f0b64a' },
  petroleo: { bg: '#f3e5c3', ray: '#e8d3a2', circle: '#1f6b68', ring: '#f0b64a', ink: '#2a1a14', body: '#fbf3df', side: '#d9c399', pip: '#1f6b68', lFill: '#f0b64a', lExt: '#2a1a14', lInk: '#2a1a14', coat: '#c2362c' },
  invertido: { bg: '#c2362c', ray: '#b02e26', circle: '#f2e4c2', ring: '#c2362c', ink: '#1f2747', body: '#fbf3df', side: '#d8c39a', pip: '#c2362c', lFill: '#f2e4c2', lExt: '#1f2747', lInk: '#1f2747', coat: '#c2362c' },
  pastel: { bg: '#f6e3cf', ray: '#f0d4bc', circle: '#7a4fb0', ring: '#ffc46a', ink: '#2b1838', body: '#fff6e6', side: '#e2c9a6', pip: '#e0457a', lFill: '#ffc46a', lExt: '#7a4fb0', lInk: '#2b1838', coat: '#e0457a' },
};

const VARIANTS = {
  // a original, arrumada: centro com mais espaço para o General
  a: { pal: 'classico', cy: 292, logoCy: 612, logoSize: 112 },
  // noite: fundo azul-marinho, letreiro creme com brilho dourado
  b: { pal: 'noturno', cy: 292, logoCy: 612, logoSize: 112, stars: true },
  // petróleo e mostarda
  c: { pal: 'petroleo', cy: 292, logoCy: 612, logoSize: 112 },
  // letreiro no topo, numa faixa (fita) de pôster
  d: { pal: 'classico', cy: 410, circleY: 400, logoCy: 104, logoSize: 100, banner: true },
  // cores invertidas + pelotão inteiro dentro da espiral
  e: { pal: 'invertido', cy: 292, logoCy: 612, logoSize: 112, platoon: true },
  // close: espiral maior (peças grandes, cortadas nas bordas), General grande
  f: { pal: 'pastel', cy: 300, logoCy: 622, logoSize: 106, zoom: 1.35, genS: 1.25 },
  // 5e (invertida + pelotão) no tamanho grande da 5f
  g: { pal: 'invertido', cy: 300, logoCy: 622, logoSize: 106, zoom: 1.35, genS: 1.25, platoon: true },
  // 5g nos formatos da Steam (desenhados em tamanho virtual; ver ../build-steam.mjs)
  gh: { pal: 'invertido', cy: 222, logoCy: 498, logoSize: 112, zoom: 1.12, genS: 1.08, platoon: true }, // header 1232x576
  gv: { pal: 'invertido', cy: 530, circleY: 495, logoCy: 118, logoSize: 90, maxW: 690, zoom: 1.0, ky: 0.58, genS: 1.15, platoon: true }, // vertical 748x896
  gs: { pal: 'invertido', small: true }, // small 924x348
};

export function spiral(svg, W, H, q) {
  const V = VARIANTS[q.get('v') || 'a'];
  const P = PAL[V.pal];
  const font = V.font || 'Bungee';
  const z = V.zoom || 1;
  const cx = W / 2, cy = V.cy;
  let o = defs();
  if (V.small) {
    // Small Capsule: o letreiro quase enche a imagem; só uma fileira de peças tombando embaixo
    o += `<rect width="${W}" height="${H}" fill="${P.bg}"/>` + sunburst(W / 2, H / 2, 1200, 28, P.ray, 0.9, 0);
    o += `<ellipse cx="${W / 2}" cy="${H / 2 + 6}" rx="${W * 0.47}" ry="${H * 0.36}" fill="${P.ink}" opacity=".22" filter="url(#blur20)"/>`;
    const row = [];
    for (let i = 0; i < 16; i++) {
      const x = 30 + i * 57.5, t = i / 15;
      const rot = t < 0.55 ? 78 : t < 0.7 ? 78 * (1 - (t - 0.55) / 0.15) : 0;
      row.push(domino({ x, y: H - 12, s: 0.27, rot, face: t < 0.7 ? 'scream' : 'nervous', pip: i % 7, body: P.body, side: P.side, ink: P.ink, pipCol: P.pip, sw: 7, shine: false }));
    }
    o += row.reverse().join('');
    svg.innerHTML = o;
    logo(svg, { cx: W / 2, cy: H * 0.38, size: 140, font, maxW: W - 40, fill: P.lFill, ext: P.lExt, ink: P.lInk, depth: 14, sw: 9, tilt: 0, shine: false, track: 4 });
    svg.insertAdjacentHTML('beforeend', grain(W, H, 0.12));
    return;
  }
  o += `<rect width="${W}" height="${H}" fill="${P.bg}"/>`;
  o += sunburst(cx, V.circleY ?? cy - 10, 1600, 28, P.ray, 0.9, 0);
  const cR = 250 * Math.min(z, 1.15);
  const cY = (V.circleY ?? cy - 10);
  if (P.glow) o += `<circle cx="${cx}" cy="${cY}" r="${cR + 30}" fill="${P.glow}" opacity=".25" filter="url(#blur20)"/>`;
  o += `<circle cx="${cx}" cy="${cY}" r="${cR}" fill="${P.circle}" stroke="${P.ink}" stroke-width="7"/>
    <circle cx="${cx}" cy="${cY}" r="${cR - 36}" fill="none" stroke="${P.ring}" stroke-width="4" stroke-dasharray="2 14" stroke-linecap="round"/>`;
  if (V.stars) o += [[120, 90, 14], [260, 200, 8], [1080, 120, 16], [1160, 330, 9], [90, 420, 10], [980, 40, 7], [340, 60, 7]].map(([x, y, r]) => star4(x, y, r, P.ring)).join('');

  // espiral em perspectiva (plano achatado em y)
  const ky = V.ky || 0.4, items = [];
  const pts = [];
  for (let th = 1.6 * Math.PI; th < 4.6 * Math.PI;) {
    const r = (40 + 32 * th) * z;
    pts.push({ th, r });
    th += (46 * z) / r;
  }
  const n = pts.length;
  pts.forEach((p, idx) => {
    const x = cx + Math.cos(p.th) * p.r, y = cy + 40 + Math.sin(p.th) * p.r * ky;
    const s = (0.36 + 0.09 * Math.sin(p.th)) * z;
    const fromOuter = (n - 1 - idx) / (n - 1);
    const tx = -(-Math.sin(p.th) * p.r + Math.cos(p.th) * 32 * z), ty = -(Math.cos(p.th) * p.r + Math.sin(p.th) * 32 * z) * ky;
    const ang = Math.atan2(ty, tx) * 180 / Math.PI;
    const wave = 0.3;
    let svgp;
    if (fromOuter < wave - 0.03) {
      svgp = `<g transform="translate(${x} ${y}) scale(1 ${ky}) rotate(${ang + 90}) translate(0 -${98 * s}) scale(${s})">${dominoTop({ x: 0, y: 0, s: 1, body: P.body, ink: P.ink, pipCol: P.pip, a: idx % 7, b: (idx * 3) % 7, sw: 8 }).replace(/^<g transform="[^"]*"/, '<g')}</g>`;
    } else {
      const k = (fromOuter - (wave - 0.03)) / 0.06;
      const tip = k < 1 ? 70 * (1 - k) : 0;
      const dir = tx >= 0 ? 1 : -1;
      const f = k < 1 ? 'scream' : (idx % 3 ? 'nervous' : 'gasp');
      svgp = domino({ x, y, s, rot: dir * tip, face: f, pip: idx % 7, body: P.body, side: P.side, ink: P.ink, pipCol: P.pip, sw: 7, shine: false });
    }
    items.push({ y, svg: svgp });
  });
  const gy = cy + 40;
  if (V.platoon) {
    const k = V.genS || 1;
    items.push({ y: gy - 30 * k, svg: general({ x: cx, y: gy - 30 * k, s: 0.82 * k, mood: 'angry', ink: P.ink }) });
    [[-62, -6, 0.5, true], [62, -6, 0.5, false], [-34, 22, 0.52, false], [34, 22, 0.52, true]].forEach(([dx, dy, s, fl]) =>
      items.push({ y: gy + dy * k, svg: soldier({ x: cx + dx * k, y: gy + dy * k, s: s * k, mood: 'scared', arms: 'up', flip: fl, ink: P.ink, coat: P.coat }) }));
  } else {
    items.push({ y: gy, svg: general({ x: cx, y: gy, s: V.genS || 1.0, mood: 'shock', ink: P.ink }) });
  }
  o += items.sort((a, b) => a.y - b.y).map((i) => i.svg).join('');
  svg.innerHTML = o;

  const L = logo(svg, { cx: W / 2, cy: V.logoCy, size: V.logoSize, font, maxW: V.maxW || 1000, fill: P.lFill, ext: P.lExt, ink: P.lInk, depth: 12, sw: 7, tilt: 0, shine: false, track: 4, glow: P.glow, glowOp: 0.35 });
  if (V.banner) {
    // fita de pôster atrás do letreiro
    const bw = L.width + 90, bh = V.logoSize * 1.25, x0 = W / 2 - bw / 2, y0 = V.logoCy - bh / 2 + 6;
    const ink = P.ink, red = P.circle, dark = '#8a2020';
    const tail = (x, d) => `<path d="M${x} ${y0 + 22} L${x + d * 90} ${y0 + 22} L${x + d * 62} ${y0 + 22 + bh / 2} L${x + d * 90} ${y0 + 22 + bh} L${x} ${y0 + 22 + bh} Z" fill="${dark}" stroke="${ink}" stroke-width="6" stroke-linejoin="round"/>`;
    const html = tail(x0 + 30, -1) + tail(x0 + bw - 30, 1) +
      `<path d="M${x0 + 30} ${y0 + bh} L${x0} ${y0 + bh} L${x0 + 30} ${y0 + 22 + bh} Z M${x0 + bw - 30} ${y0 + bh} L${x0 + bw} ${y0 + bh} L${x0 + bw - 30} ${y0 + 22 + bh} Z" fill="#4a0e0e" stroke="${ink}" stroke-width="5" stroke-linejoin="round"/>
       <rect x="${x0}" y="${y0}" width="${bw}" height="${bh}" fill="${red}" stroke="${ink}" stroke-width="7"/>
       <rect x="${x0 + 12}" y="${y0 + 10}" width="${bw - 24}" height="${bh - 20}" fill="none" stroke="${P.bg}" stroke-width="3" stroke-dasharray="2 12" stroke-linecap="round"/>`;
    const NS = 'http://www.w3.org/2000/svg';
    const gb = document.createElementNS(NS, 'g');
    gb.innerHTML = html;
    svg.insertBefore(gb, L.el);
    // letreiro creme sobre a fita
    L.el.querySelectorAll('text').forEach((t) => { if (t.getAttribute('fill') === P.lFill) t.setAttribute('fill', P.bg); });
  }
  svg.insertAdjacentHTML('beforeend', grain(W, H, 0.14));
}
