// As cinco propostas de key art (desenhadas para 1232x706, o Main Capsule).
import { spiral } from './spiral.js';
import { queda } from './queda.js';
import { INK, C, rng, domino, dominoTop, soldier, general, crownAlone, owner, glove, defs, grain, vignette, sunburst, star4, puff, burst, logo } from './lib.js';

const bez = (p0, p1, p2, p3, t) => {
  const u = 1 - t;
  return [0, 1].map((k) => u * u * u * p0[k] + 3 * u * u * t * p1[k] + 3 * u * t * t * p2[k] + t * t * t * p3[k]);
};
/** Distribui peças ao longo da curva com passo proporcional ao tamanho (perspectiva). */
const along = (P, sAt, gap, tMax = 1) => {
  const out = [];
  let prev = bez(...P, 0), acc = Infinity, need = 0;
  for (let t = 0; t <= tMax; t += 0.0005) {
    const p = bez(...P, t);
    acc += Math.hypot(p[0] - prev[0], p[1] - prev[1]);
    prev = p;
    if (acc >= need) { const s = sAt(t); out.push({ x: p[0], y: p[1], s, t }); acc = 0; need = gap * s; }
  }
  return out;
};
const finish = (svg, W, H, op) => svg.insertAdjacentHTML('beforeend', grain(W, H, op));

export const SCENES = {
  spiral,
  queda,
  // 1 — A Onda: a corrente atravessa a mesa e chega no pelotão apavorado
  onda(svg, W, H) {
    let o = defs();
    o += `<linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a1468"/><stop offset=".7" stop-color="#1e0a2c"/><stop offset="1" stop-color="#0f0518"/></linearGradient>
      <rect width="${W}" height="${H}" fill="url(#sky)"/>`;
    o += sunburst(980, 420, 1500, 18, C.orange, 0.1, 0.1);
    o += `<circle cx="990" cy="430" r="300" fill="${C.orange}" opacity=".55" filter="url(#blur40)"/>`;
    o += `<g fill="none" stroke-linecap="round" filter="url(#blur8)" opacity=".5">
      <path d="M-50 260 C 200 120, 420 330, 700 200 S 1100 40, 1300 160" stroke="${C.magenta}" stroke-width="46"/>
      <path d="M-50 380 C 260 280, 520 420, 760 330 S 1080 260, 1300 360" stroke="#7a2a8a" stroke-width="30"/>
      <path d="M100 -30 C 300 90, 600 60, 820 120" stroke="${C.orange}" stroke-width="18" opacity=".6"/></g>`;
    // mesa
    o += `<path d="M0 520 Q 616 488 1232 520 L1232 706 L0 706 Z" fill="#24132e"/>
      <path d="M0 520 Q 616 488 1232 520" stroke="#6a3c74" stroke-width="5" fill="none"/>
      <g stroke="#3a2046" stroke-width="2" opacity=".8">${Array.from({ length: 14 }, (_, i) => `<line x1="${616 + (i - 6.5) * 60}" y1="506" x2="${616 + (i - 6.5) * 260}" y2="706"/>`).join('')}
      <line x1="0" y1="560" x2="1232" y2="560"/><line x1="0" y1="620" x2="1232" y2="620"/></g>`;
    // sombra quente no chão onde a onda bate
    o += `<ellipse cx="900" cy="580" rx="300" ry="50" fill="${C.orange}" opacity=".25" filter="url(#blur20)"/>`;
    // pelotão (fundo) + General
    const back = [];
    back.push(general({ x: 1075, y: 548, s: 0.66, mood: 'angry' }));
    [[905, 552, 0.6], [985, 560, 0.62], [1160, 556, 0.6], [1215, 575, 0.66]].forEach(([x, y, s], i) =>
      back.push(soldier({ x, y, s, mood: 'scared', arms: i % 2 ? 'up' : 'out', flip: i % 2 === 0 })));
    o += back.join('');
    // corrente
    const chain = along([[40, 735], [300, 560], [580, 520], [880, 600]], (t) => 1.45 - 0.9 * Math.pow(t, 0.75), 82, 0.97);
    const front = 3; // índice da peça que está caindo agora
    const items = chain.map((c, i) => {
      let rot = 0, f;
      if (i < front - 1) { rot = 58; f = 'xx'; }
      else if (i === front - 1) { rot = 40; f = 'gleeful'; }
      else if (i === front) { rot = 20; f = 'scream'; }
      else if (i === front + 1) { rot = 6; f = 'gasp'; }
      else f = i % 2 ? 'nervous' : 'gasp';
      return { y: c.y, svg: domino({ x: c.x, y: c.y, s: c.s, rot, face: f, pip: (i * 3 + 2) % 7, sw: 5.5 }) };
    });
    // peças mais distantes primeiro
    o += items.reverse().map((it) => it.svg).join('');
    // soldados da frente, um já tombando
    o += soldier({ x: 975, y: 650, s: 0.86, rot: 26, mood: 'dizzy', arms: 'out' });
    o += soldier({ x: 1110, y: 668, s: 0.92, mood: 'scared', arms: 'up', flip: true });
    o += puff(905, 640, 34, C.ivory, INK, 5) + puff(640, 560, 22, C.ivory, INK, 9);
    o += star4(880, 520, 22, C.yellow, 10) + star4(1040, 600, 14, '#fff') + star4(760, 470, 12, '#fff', 20) + star4(1180, 470, 16, C.yellow);
    o += vignette(W, H, 'vig', 0.6);
    svg.innerHTML = o;
    logo(svg, { cx: W / 2, cy: 138, size: 152, ext: C.orange, glow: C.magenta, glowOp: 0.7, tilt: 9 });
    finish(svg, W, H, 0.1);
  },

  // 2 — O Herói: um dominó gigante decidido, tombando sobre soldadinhos minúsculos
  heroi(svg, W, H) {
    let o = defs();
    o += `<radialGradient id="bg" cx="40%" cy="68%" r="85%"><stop offset="0" stop-color="#ffd27a"/><stop offset=".22" stop-color="#ff9a3a"/><stop offset=".5" stop-color="#d23d2c"/><stop offset=".8" stop-color="#5e1238"/><stop offset="1" stop-color="#2a0a2e"/></radialGradient>
      <rect width="${W}" height="${H}" fill="url(#bg)"/>`;
    o += sunburst(480, 520, 1600, 24, '#fff4d8', 0.13, 0.05);
    o += `<g fill="#fff" opacity=".18"><rect x="0" y="0" width="${W}" height="${H}" fill="url(#halftone)" opacity=".5"/></g>`;
    // chão
    o += `<path d="M0 640 Q 600 610 1232 646 L1232 706 L0 706 Z" fill="#2a0c24"/>
      <path d="M0 640 Q 600 610 1232 646" stroke="${INK}" stroke-width="6" fill="none"/>`;
    // sombra comprida do herói
    o += `<path d="M520 650 L1232 600 L1232 690 L520 676 Z" fill="#12040f" opacity=".45"/>`;
    // linhas de movimento
    o += `<g fill="none" stroke="#fff6dc" stroke-width="9" stroke-linecap="round" opacity=".85">
      <path d="M300 250 Q 340 180 420 150"/><path d="M262 330 Q 300 250 380 214"/><path d="M250 420 Q 268 356 318 318"/></g>`;
    o += domino({ x: 500, y: 668, s: 2.32, rot: 17, face: 'determined', pip: 6, sw: 4.6 });
    // soldadinhos olhando para cima
    o += soldier({ x: 850, y: 662, s: 0.78, mood: 'scared', arms: 'up', rot: -6, flip: true });
    o += soldier({ x: 960, y: 668, s: 0.86, mood: 'scared', arms: 'out', rot: 4 });
    o += soldier({ x: 1075, y: 664, s: 0.8, mood: 'scared', arms: 'up', rot: -3, flip: true });
    o += soldier({ x: 1185, y: 676, s: 0.9, mood: 'scared', arms: 'out' });
    o += star4(250, 520, 20, '#fff') + star4(190, 470, 11, '#fff') + star4(1130, 470, 14, '#fff');
    o += vignette(W, H, 'vig', 0.55, '#1a0418');
    svg.innerHTML = o;
    logo(svg, { cx: W / 2 + 10, cy: 104, size: 140, ext: '#a0182a', glow: '#3a0820', glowOp: 0.6, tilt: 8 });
    finish(svg, W, H, 0.1);
  },

  // 3 — O Dono: o boneco gigante manipula o exército por fios; os dominós enfrentam
  dono(svg, W, H) {
    let o = defs();
    o += `<rect width="${W}" height="${H}" fill="#140a1c"/>
      <radialGradient id="glowO" cx="68%" cy="34%" r="45%"><stop offset="0" stop-color="#6a2a7a"/><stop offset="1" stop-color="#140a1c" stop-opacity="0"/></radialGradient>
      <rect width="${W}" height="${H}" fill="url(#glowO)"/>`;
    // swirls roxos no fundo
    o += `<g fill="none" stroke-linecap="round" filter="url(#blur8)" opacity=".55">
      <path d="M560 40 C 760 -20, 1000 120, 1240 60" stroke="${C.magenta}" stroke-width="40"/>
      <path d="M520 400 C 700 300, 980 460, 1240 330" stroke="${C.orange}" stroke-width="22" opacity=".6"/></g>`;
    o += owner({ x: 850, y: 222, s: 0.95 });
    // palco
    o += `<linearGradient id="plank" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5a3420"/><stop offset="1" stop-color="#2a160c"/></linearGradient>
      <path d="M0 555 L1232 555 L1232 706 L0 706 Z" fill="url(#plank)"/>
      <rect x="0" y="548" width="${W}" height="12" fill="${C.gold}" stroke="${INK}" stroke-width="4"/>
      <g stroke="#1e0e06" stroke-width="3" opacity=".7">${Array.from({ length: 16 }, (_, i) => `<line x1="${(i - 3) * 90 + 120}" y1="560" x2="${(i - 3) * 140}" y2="706"/>`).join('')}</g>`;
    // luz do holofote
    o += `<radialGradient id="spot" cx="50%" cy="100%" r="60%"><stop offset="0" stop-color="#ffe2a0" stop-opacity=".5"/><stop offset="1" stop-color="#ffe2a0" stop-opacity="0"/></radialGradient>
      <ellipse cx="560" cy="640" rx="520" ry="80" fill="url(#spot)"/>
      <path d="M470 0 L650 0 L1000 660 L120 660 Z" fill="#ffe7b0" opacity=".07"/>`;
    // barra de controle de marionete + fios
    const bar = [[690, 420], [1020, 404]];
    const targets = [[700, 590], [790, 600], [880, 592], [970, 604], [1050, 594]];
    o += `<g stroke="#e8dcc0" stroke-width="2" opacity=".8">${targets.map(([x, y], i) => {
      const t = i / (targets.length - 1);
      const bx = bar[0][0] + (bar[1][0] - bar[0][0]) * t, by = bar[0][1] + (bar[1][1] - bar[0][1]) * t;
      return `<line x1="${bx}" y1="${by}" x2="${x}" y2="${y - 128}"/>`;
    }).join('')}</g>`;
    // soldadinhos-marionete
    targets.forEach(([x, y], i) => { o += soldier({ x, y, s: 0.78, mood: 'haunted', arms: i % 2 ? 'out' : 'down', rot: (i % 2 ? 4 : -4) }); });
    o += `<g transform="rotate(-2.8 855 412)"><rect x="660" y="402" width="390" height="20" rx="8" fill="#8a5a32" stroke="${INK}" stroke-width="5"/>
      <rect x="844" y="372" width="22" height="84" rx="8" fill="#8a5a32" stroke="${INK}" stroke-width="5"/></g>`;
    o += glove({ x: 690, y: 450, s: 0.85, rot: 6 }) + glove({ x: 1020, y: 436, s: 0.85, rot: -6, flip: true });
    // corrente de dominós corajosos à esquerda
    const dom = [[215, 690, 1.0, 'determined'], [335, 668, 0.88, 'evil'], [442, 650, 0.78, 'determined'], [535, 636, 0.68, 'gleeful']];
    o += dom.slice().reverse().map(([x, y, s, f], i) => domino({ x, y, s, face: f, pip: (i * 2 + 1) % 7, rot: -2 })).join('');
    // cortinas
    const curtain = (x0, dir) => {
      let c = '';
      for (let k = 0; k < 5; k++) {
        const x = x0 + dir * k * 30;
        c += `<path d="M${x} -10 C ${x + dir * 30} 200, ${x - dir * 10} 420, ${x + dir * 24} 720 L ${x + dir * 60} 720 C ${x + dir * 30} 420, ${x + dir * 70} 200, ${x + dir * 36} -10 Z" fill="${k % 2 ? '#8e1424' : '#b81e30'}" stroke="${INK}" stroke-width="4"/>`;
      }
      return c;
    };
    o += curtain(-90, 1) + curtain(1322, -1);
    o += `<path d="M0 0 L1232 0 L1232 54 ${Array.from({ length: 12 }, (_, i) => `Q ${1232 - (i + 0.5) * 102.7} 96 ${1232 - (i + 1) * 102.7} 54`).join(' ')} Z" fill="#a51a2c" stroke="${INK}" stroke-width="5"/>
      <path d="M0 50 ${Array.from({ length: 12 }, (_, i) => `Q ${(i + 0.5) * 102.7} 92 ${(i + 1) * 102.7} 50`).join(' ')}" stroke="${C.gold}" stroke-width="7" fill="none"/>`;
    o += vignette(W, H, 'vig', 0.7);
    svg.innerHTML = o;
    logo(svg, { cx: 385, cy: 200, size: 124, maxW: 600, ext: C.goldD, fill: C.ivory, glow: C.orange, glowOp: 0.45, tilt: 8 });
    finish(svg, W, H, 0.1);
  },

  // 4 — Impacto: quadrinho, a corrente acerta o General e a coroa voa
  impacto(svg, W, H) {
    let o = defs();
    o += `<rect width="${W}" height="${H}" fill="#2c0c40"/>`;
    const cx = 830, cy = 330;
    o += `<g stroke="#ff9ad0" stroke-width="5" opacity=".22">${Array.from({ length: 60 }, (_, i) => {
      const a = (i / 60) * Math.PI * 2, r0 = 260 + (i % 3) * 40;
      return `<line x1="${cx + Math.cos(a) * r0}" y1="${cy + Math.sin(a) * r0}" x2="${cx + Math.cos(a) * 1400}" y2="${cy + Math.sin(a) * 1400}"/>`;
    }).join('')}</g>`;
    o += `<rect width="${W}" height="${H}" fill="url(#halftone)" opacity=".18"/>`;
    o += burst(cx, cy, 330, 560, 16, '#ff6a2a', INK, 7, 3, 0.1);
    o += burst(cx, cy, 250, 410, 14, C.orangeL, INK, 6, 11, 0.3);
    o += burst(cx, cy, 150, 250, 12, '#fff3c4', INK, 5, 19, 0.0);
    o += `<rect x="${cx - 330}" y="${cy - 300}" width="660" height="600" fill="url(#halftoneS)" opacity=".12" clip-path="circle(300px at 330px 300px)"/>`;
    // detritos voando
    o += soldier({ x: 1080, y: 560, s: 0.62, rot: 70, mood: 'dizzy', arms: 'out' });
    o += soldier({ x: 1150, y: 300, s: 0.56, rot: -38, mood: 'scared', arms: 'up' });
    o += soldier({ x: 680, y: 150, s: 0.5, rot: -125, mood: 'dizzy', arms: 'out' });
    o += general({ x: 930, y: 470, s: 1.6, rot: 30, mood: 'shock', crown: false });
    o += crownAlone({ x: 1085, y: 120, s: 1.9, rot: 28 });
    o += `<g stroke="${INK}" stroke-width="4" stroke-linecap="round" fill="none"><path d="M1030 150 l-24 -8 M1036 172 l-28 2 M1040 192 l-22 10"/></g>`;
    // corrente em queda (da frente-esquerda até o impacto)
    const chain = along([[-30, 790], [200, 640], [430, 560], [700, 470]], (t) => 1.7 - 0.8 * t, 92);
    const items = chain.map((c, i) => domino({ x: c.x, y: c.y, s: c.s, rot: 46 - 14 * c.t, face: i === chain.length - 1 ? 'gleeful' : i % 2 ? 'scream' : 'gleeful', pip: (i * 5) % 7, sw: 5 }));
    o += items.reverse().join('');
    o += star4(720, 300, 30, '#fff') + star4(1000, 640, 20, C.yellow) + star4(600, 420, 14, '#fff') + star4(1170, 430, 18, '#fff', 15);
    o += `<g fill="${INK}">${[[760, 250, 9], [1010, 250, 7], [1180, 610, 8], [990, 190, 6]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}"/>`).join('')}</g>`;
    o += vignette(W, H, 'vig', 0.5);
    svg.innerHTML = o;
    logo(svg, { cx: 340, cy: 118, size: 132, maxW: 640, ext: '#7a1fa0', fill: C.yellow, glow: '#000', glowOp: 0.5, tilt: 10, rot: -5 });
    finish(svg, W, H, 0.09);
  },

  // 5 — Espiral: pôster retrô de cores chapadas, a espiral de peças cerca o General
  espiral(svg, W, H) {
    const NAV = '#1f2747', CR = '#c2362c', CRM = '#f2e4c2';
    let o = defs();
    o += `<rect width="${W}" height="${H}" fill="${CRM}"/>`;
    const cx = 616, cy = 300;
    o += sunburst(cx, cy, 1400, 28, '#e6d2a6', 0.8, 0);
    o += `<circle cx="${cx}" cy="${cy - 10}" r="250" fill="${CR}" stroke="${NAV}" stroke-width="7"/>
      <circle cx="${cx}" cy="${cy - 10}" r="214" fill="none" stroke="${CRM}" stroke-width="4" stroke-dasharray="2 14" stroke-linecap="round"/>`;
    // espiral em perspectiva (plano achatado em y)
    const ky = 0.4, items = [];
    let th = 1.25 * Math.PI;
    const pts = [];
    while (th < 4.6 * Math.PI) {
      const r = 40 + 32 * th;
      pts.push({ th, r });
      th += 46 / r;
    }
    const n = pts.length;
    pts.forEach((p, idx) => {
      const x = cx + Math.cos(p.th) * p.r, y = cy + 40 + Math.sin(p.th) * p.r * ky;
      const s = 0.36 + 0.09 * Math.sin(p.th);
      const fromOuter = (n - 1 - idx) / (n - 1); // 0 = ponta de fora (começo da corrente)
      // tangente no sentido da onda (de fora para dentro)
      const tx = -(-Math.sin(p.th) * p.r + Math.cos(p.th) * 32), ty = -(Math.cos(p.th) * p.r + Math.sin(p.th) * 32) * ky;
      const ang = Math.atan2(ty, tx) * 180 / Math.PI;
      const wave = 0.3;
      let svgp;
      if (fromOuter < wave - 0.03) {
        svgp = `<g transform="translate(${x} ${y}) scale(1 ${ky}) rotate(${ang + 90}) translate(0 -${98 * s}) scale(${s})">${dominoTop({ x: 0, y: 0, s: 1, body: '#fbf3df', ink: NAV, pipCol: CR, a: idx % 7, b: (idx * 3) % 7, sw: 8 }).replace(/^<g transform="[^"]*"/, '<g')}</g>`;
      } else {
        const k = (fromOuter - (wave - 0.03)) / 0.06;
        const tip = k < 1 ? 70 * (1 - k) : 0;
        const dir = tx >= 0 ? 1 : -1;
        const f = k < 1 ? 'scream' : (idx % 3 ? 'nervous' : 'gasp');
        svgp = domino({ x, y, s, rot: dir * tip, face: f, pip: idx % 7, body: '#fbf3df', side: '#d8c39a', ink: NAV, pipCol: CR, sw: 7, shine: false });
      }
      items.push({ y, svg: svgp });
    });
    items.push({ y: cy + 30, svg: general({ x: cx, y: cy + 40, s: 1.0, mood: 'shock', ink: NAV }) });
    o += items.sort((a, b) => a.y - b.y).map((i) => i.svg).join('');
    svg.innerHTML = o;
    logo(svg, { cx: W / 2, cy: 612, size: 112, font: 'Bungee', maxW: 1000, fill: CR, ext: NAV, ink: NAV, depth: 12, sw: 7, tilt: 0, shine: false, track: 4 });
    finish(svg, W, H, 0.14);
  },
};
