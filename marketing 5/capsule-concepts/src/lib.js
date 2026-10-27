// Peças de ilustração 2D (SVG) do DOMINOTION: dominós com rosto, soldadinhos, General, o Dono, fundos e logo.
// Tudo desenhado em unidades locais e posicionado com translate/rotate/scale.

export const INK = '#1c0f1e';
export const C = {
  ivory: '#f6ead0', ivoryS: '#cdb48a', ivoryD: '#9c8460',
  red: '#c8392d', redD: '#8a2020', navy: '#22294d', navyD: '#141834',
  gold: '#f0b64a', goldD: '#a8742a', skin: '#f3e3c8', cheek: '#ee8a78',
  purple: '#2b0f3d', purpleD: '#12061c', purpleM: '#5a1a62', magenta: '#b02c72',
  orange: '#ff8a2a', orangeL: '#ffc46a', yellow: '#ffe28a', cream: '#f1e3c4', wood: '#6b4428', woodD: '#3b2418',
};

export function rng(seed = 1) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

const g = (tf, inner, extra = '') => `<g transform="${tf}" ${extra}>${inner}</g>`;

// ---------- rostos de dominó (centro do rosto em 0,0; peça com largura 100) ----------
function face(type, ink) {
  const S = `stroke="${ink}" stroke-linecap="round" stroke-linejoin="round" fill="none"`;
  switch (type) {
    case 'scream':
      return `<path d="M-30 -14 L-12 -4 L-30 6" ${S} stroke-width="6"/><path d="M30 -14 L12 -4 L30 6" ${S} stroke-width="6"/>
        <ellipse cx="0" cy="20" rx="11" ry="14" fill="${ink}"/><ellipse cx="0" cy="27" rx="6" ry="5" fill="#d9555a"/>`;
    case 'xx':
      return `<path d="M-30 -14 L-14 2 M-14 -14 L-30 2 M30 -14 L14 2 M14 -14 L30 2" ${S} stroke-width="6"/>
        <path d="M-18 20 q6 -7 12 0 q6 7 12 0 q6 -7 12 0" ${S} stroke-width="5"/>`;
    case 'determined':
      return `<path d="M-36 -22 L-10 -12 M36 -22 L10 -12" ${S} stroke-width="7"/>
        <ellipse cx="-21" cy="-1" rx="6.5" ry="9" fill="${ink}"/><ellipse cx="21" cy="-1" rx="6.5" ry="9" fill="${ink}"/>
        <circle cx="-19" cy="-4" r="2.4" fill="#fff"/><circle cx="23" cy="-4" r="2.4" fill="#fff"/>
        <path d="M-18 18 Q4 28 24 12" ${S} stroke-width="6"/>`;
    case 'gleeful':
      return `<path d="M-34 -2 Q-22 -18 -10 -2 M10 -2 Q22 -18 34 -2" ${S} stroke-width="6.5"/>
        <path d="M-26 8 Q0 44 26 8 Z" fill="${ink}" stroke="${ink}" stroke-width="4" stroke-linejoin="round"/>
        <path d="M-20 10 L20 10 L17 16 L-17 16 Z" fill="#fff"/><ellipse cx="0" cy="27" rx="8" ry="4.5" fill="#d9555a"/>`;
    case 'happy':
      return `<path d="M-32 0 Q-21 -14 -10 0 M10 0 Q21 -14 32 0" ${S} stroke-width="6"/>
        <path d="M-18 12 Q0 32 18 12 Z" fill="${ink}" stroke="${ink}" stroke-width="4" stroke-linejoin="round"/>`;
    case 'nervous':
      return `<circle cx="-20" cy="-4" r="11" fill="#fff" stroke="${ink}" stroke-width="4.5"/><circle cx="20" cy="-4" r="11" fill="#fff" stroke="${ink}" stroke-width="4.5"/>
        <circle cx="-17" cy="-3" r="4.2" fill="${ink}"/><circle cx="23" cy="-3" r="4.2" fill="${ink}"/>
        <path d="M-14 22 q5 -6 10 0 q5 6 10 0 q5 -6 10 0" ${S} stroke-width="4.5"/>
        <path d="M40 -26 q-7 10 0 13 q7 -3 0 -13 Z" fill="#8fd4ff" stroke="${ink}" stroke-width="3"/>`;
    case 'gasp':
      return `<circle cx="-20" cy="-4" r="9" fill="${ink}"/><circle cx="20" cy="-4" r="9" fill="${ink}"/>
        <circle cx="-17" cy="-7" r="3" fill="#fff"/><circle cx="23" cy="-7" r="3" fill="#fff"/>
        <ellipse cx="0" cy="20" rx="7" ry="9" fill="${ink}"/>`;
    case 'evil':
      return `<path d="M-36 -18 L-10 -6 M36 -18 L10 -6" ${S} stroke-width="7"/>
        <circle cx="-20" cy="2" r="6" fill="${ink}"/><circle cx="20" cy="2" r="6" fill="${ink}"/>
        <path d="M-24 14 Q0 34 24 14" ${S} stroke-width="6"/>`;
    default: return '';
  }
}

const PIP = {
  0: [], 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};
function pips(n, col) {
  return PIP[n].map(([x, y]) => `<circle cx="${x * 25}" cy="${y * 25}" r="8.5" fill="${col}"/>`).join('');
}

/** Dominó em pé com rosto em cima e pips embaixo. Pivô na base central; rot>0 tomba para a direita. */
export function domino({ x, y, s = 1, rot = 0, face: f = 'happy', pip = 5, body = C.ivory, side = C.ivoryS, ink = INK, pipCol = INK, sw = 5.5, flip = false, depth = 17, shine = true, faceCol }) {
  const W = 100, H = 196, d = depth;
  let o = '';
  o += `<rect x="${-W / 2 + d}" y="${-H - d * 0.62}" width="${W}" height="${H}" rx="15" fill="${side}" stroke="${ink}" stroke-width="${sw}" stroke-linejoin="round"/>`;
  o += `<rect x="${-W / 2}" y="${-H}" width="${W}" height="${H}" rx="15" fill="${body}" stroke="${ink}" stroke-width="${sw}"/>`;
  if (shine) o += `<path d="M${-W / 2 + 11} ${-H + 20} L${-W / 2 + 11} -22" stroke="#fff" stroke-opacity=".6" stroke-width="6" stroke-linecap="round"/>`;
  o += `<line x1="-32" y1="${-H / 2}" x2="32" y2="${-H / 2}" stroke="${ink}" stroke-width="4.5" stroke-linecap="round" opacity=".75"/>`;
  o += g(`translate(0 ${-H * 0.75})`, face(f, faceCol || ink));
  o += g(`translate(0 ${-H * 0.25})`, pips(pip, pipCol));
  return g(`translate(${x} ${y}) rotate(${rot}) scale(${flip ? -s : s} ${s})`, o);
}

/** Só a face de um dominó (rosto em cima, pips embaixo), em x -50..50, y -196..0, sem a lateral. */
export function dominoFace({ face: f = 'happy', pip = 5, body = C.ivory, ink = INK, pipCol = INK, sw = 5.5, showFace = true }) {
  const H = 196;
  return `<rect x="-50" y="${-H}" width="100" height="${H}" rx="15" fill="${body}" stroke="${ink}" stroke-width="${sw}"/>
    <line x1="-32" y1="${-H / 2}" x2="32" y2="${-H / 2}" stroke="${ink}" stroke-width="4.5" stroke-linecap="round"/>
    ${showFace ? g(`translate(0 ${-H * 0.75})`, face(f, ink)) : g(`translate(0 ${-H * 0.75})`, pips((pip + 3) % 7, pipCol))}
    ${g(`translate(0 ${-H * 0.25})`, pips(pip, pipCol))}`;
}

/** Dominó deitado visto de cima (para cenas vistas do alto). */
export function dominoTop({ x, y, s = 1, rot = 0, body = C.ivory, ink = INK, pipCol = INK, a = 3, b = 5, sw = 5 }) {
  const o = `<rect x="-50" y="-98" width="100" height="196" rx="15" fill="${body}" stroke="${ink}" stroke-width="${sw}"/>
    <line x1="-32" y1="0" x2="32" y2="0" stroke="${ink}" stroke-width="4.5" stroke-linecap="round" opacity=".75"/>
    ${g('translate(0 -49)', pips(a, pipCol))}${g('translate(0 49)', pips(b, pipCol))}`;
  return g(`translate(${x} ${y}) rotate(${rot}) scale(${s})`, o);
}

// ---------- soldadinho de brinquedo (altura ~170, pivô no chão) ----------
export function soldier({ x, y, s = 1, rot = 0, mood = 'scared', coat = C.red, pants = C.navy, arms = 'up', flip = false, ink = INK, sw = 3.5 }) {
  const ol = `stroke="${ink}" stroke-width="${sw}" stroke-linejoin="round"`;
  const arm = (side) => {
    const a = arms === 'up' ? side * 150 : arms === 'out' ? side * 70 : side * 12;
    return g(`translate(${side * 21} -88) rotate(${-a})`,
      `<rect x="-5.5" y="-2" width="11" height="34" rx="5" fill="${coat}" ${ol}/><circle cx="0" cy="35" r="6" fill="${C.skin}" ${ol}/>`);
  };
  let fc = '';
  if (mood === 'scared') fc = `<ellipse cx="-6" cy="-112" rx="4.6" ry="5.8" fill="#fff" stroke="${ink}" stroke-width="2"/><ellipse cx="6" cy="-112" rx="4.6" ry="5.8" fill="#fff" stroke="${ink}" stroke-width="2"/>
      <circle cx="-5.5" cy="-111" r="1.9" fill="${ink}"/><circle cx="6.5" cy="-111" r="1.9" fill="${ink}"/><ellipse cx="0" cy="-101" rx="3.6" ry="4.6" fill="${ink}"/>
      <path d="M15 -124 q-4 6 0 8 q4 -2 0 -8 Z" fill="#8fd4ff" stroke="${ink}" stroke-width="1.5"/>`;
  else if (mood === 'stern') fc = `<path d="M-11 -118 L-2 -115 M11 -118 L2 -115" stroke="${ink}" stroke-width="2.6" stroke-linecap="round"/><circle cx="-6" cy="-110" r="2.4" fill="${ink}"/><circle cx="6" cy="-110" r="2.4" fill="${ink}"/><path d="M-4 -101 L4 -101" stroke="${ink}" stroke-width="2.4" stroke-linecap="round"/>`;
  else if (mood === 'dizzy') fc = `<path d="M-9 -115 l6 6 m0 -6 l-6 6 M3 -115 l6 6 m0 -6 l-6 6" stroke="${ink}" stroke-width="2.4" stroke-linecap="round"/><path d="M-5 -101 q2.5 -3 5 0 q2.5 3 5 0" stroke="${ink}" stroke-width="2.2" fill="none"/>`;
  else if (mood === 'haunted') fc = `<ellipse cx="-6" cy="-111" rx="4.4" ry="5" fill="${ink}"/><ellipse cx="6" cy="-111" rx="4.4" ry="5" fill="${ink}"/><circle cx="-5" cy="-112" r="1.5" fill="#ffd27a"/><circle cx="7" cy="-112" r="1.5" fill="#ffd27a"/><path d="M-5 -101 L5 -101" stroke="${ink}" stroke-width="2.2"/>`;
  const o = `
    <ellipse cx="0" cy="-6" rx="33" ry="10" fill="${C.woodD}" ${ol}/>
    <ellipse cx="0" cy="-12" rx="31" ry="8.5" fill="${C.wood}" stroke="${C.gold}" stroke-width="2.5"/>
    <rect x="-15" y="-52" width="13" height="42" fill="${pants}" ${ol}/><rect x="2" y="-52" width="13" height="42" fill="${pants}" ${ol}/>
    <rect x="-16" y="-24" width="15" height="13" rx="2" fill="#141018" ${ol}/><rect x="1" y="-24" width="15" height="13" rx="2" fill="#141018" ${ol}/>
    ${arm(-1)}${arm(1)}
    <path d="M-20 -94 Q-24 -66 -23 -46 L23 -46 Q24 -66 20 -94 Q0 -100 -20 -94 Z" fill="${coat}" ${ol}/>
    <path d="M-17 -91 L17 -56 M17 -91 L-17 -56" stroke="#f4ecd8" stroke-width="5"/>
    <circle cx="0" cy="-73.5" r="4.5" fill="${C.gold}" stroke="${ink}" stroke-width="1.8"/>
    <rect x="-23" y="-54" width="46" height="7" fill="#f4ecd8" ${ol}/><rect x="-4" y="-55" width="8" height="9" fill="${C.gold}" stroke="${ink}" stroke-width="1.6"/>
    <ellipse cx="-21" cy="-92" rx="9" ry="5" fill="${C.gold}" ${ol}/><ellipse cx="21" cy="-92" rx="9" ry="5" fill="${C.gold}" ${ol}/>
    <circle cx="0" cy="-110" r="16" fill="${C.skin}" ${ol}/>
    <circle cx="-10" cy="-104" r="3.6" fill="${C.cheek}" opacity=".85"/><circle cx="10" cy="-104" r="3.6" fill="${C.cheek}" opacity=".85"/>
    ${fc}
    <rect x="-14" y="-152" width="28" height="34" rx="3" fill="#17121c" ${ol}/>
    <rect x="-14" y="-125" width="28" height="5" fill="${C.gold}" stroke="${ink}" stroke-width="1.6"/>
    <path d="M-17 -119 L17 -119 L13 -114 L-13 -114 Z" fill="#17121c" ${ol}/>
    <circle cx="0" cy="-138" r="5" fill="${C.gold}" stroke="${ink}" stroke-width="1.8"/>
    <ellipse cx="0" cy="-160" rx="6.5" ry="10" fill="${C.red}" ${ol}/><ellipse cx="0" cy="-166" rx="4" ry="4.5" fill="#fff" stroke="${ink}" stroke-width="1.6"/>`;
  return g(`translate(${x} ${y}) rotate(${rot}) scale(${flip ? -s : s} ${s})`, o);
}

// ---------- o General (chefe, altura ~205) ----------
export function general({ x, y, s = 1, rot = 0, mood = 'angry', ink = INK, sw = 4, crown = true, flip = false }) {
  const ol = `stroke="${ink}" stroke-width="${sw}" stroke-linejoin="round"`;
  const eyes = mood === 'shock'
    ? `<circle cx="-10" cy="-153" r="7" fill="#fff" stroke="${ink}" stroke-width="2.5"/><circle cx="10" cy="-153" r="7" fill="#fff" stroke="${ink}" stroke-width="2.5"/><circle cx="-10" cy="-152" r="2.6" fill="#ff2a2a"/><circle cx="10" cy="-152" r="2.6" fill="#ff2a2a"/>
       <ellipse cx="0" cy="-136" rx="7" ry="8" fill="${ink}"/>`
    : `<path d="M-21 -166 L-3 -157 M21 -166 L3 -157" stroke="${ink}" stroke-width="5" stroke-linecap="round"/>
       <ellipse cx="-10" cy="-152" rx="5.5" ry="4" fill="#ff2a2a" filter="url(#redglow)"/><ellipse cx="10" cy="-152" rx="5.5" ry="4" fill="#ff2a2a" filter="url(#redglow)"/>
       <path d="M-13 -137 L-8 -141 L-3 -137 L2 -141 L7 -137 L12 -141" stroke="${ink}" stroke-width="3" fill="none" stroke-linejoin="round"/>`;
  const crownSvg = crown ? `<path d="M-24 -170 L-26 -196 L-14 -182 L-7 -202 L0 -184 L7 -202 L14 -182 L26 -196 L24 -170 Z" fill="${C.gold}" ${ol}/>
      <circle cx="0" cy="-178" r="4.5" fill="#e0263a" stroke="${ink}" stroke-width="2"/>` : '';
  const o = `
    <ellipse cx="0" cy="-7" rx="48" ry="12" fill="${C.woodD}" ${ol}/>
    <ellipse cx="0" cy="-14" rx="46" ry="10" fill="${C.wood}" stroke="${C.gold}" stroke-width="3"/>
    <path d="M-30 -130 L-44 -18 Q0 -10 44 -18 L30 -130 Q0 -138 -30 -130 Z" fill="#4e1230" ${ol}/>
    <path d="M-43 -24 Q0 -16 43 -24" stroke="${C.gold}" stroke-width="5" fill="none"/>
    <path d="M0 -128 L0 -20" stroke="#2a0818" stroke-width="3"/>
    <circle cx="0" cy="-82" r="8" fill="#f6efe2" ${ol}/>
    <ellipse cx="-31" cy="-126" rx="15" ry="8" fill="${C.gold}" ${ol}/><ellipse cx="31" cy="-126" rx="15" ry="8" fill="${C.gold}" ${ol}/>
    <path d="M-44 -122 l0 9 M-39 -120 l0 10 M-34 -119 l0 10 M44 -122 l0 9 M39 -120 l0 10 M34 -119 l0 10" stroke="${C.goldD}" stroke-width="3" stroke-linecap="round"/>
    <circle cx="0" cy="-152" r="25" fill="#f3eee4" ${ol}/>
    <path d="M-18 -136 Q0 -122 18 -136" stroke="#5a5050" stroke-width="2" fill="none" opacity=".5"/>
    ${eyes}${crownSvg}`;
  return g(`translate(${x} ${y}) rotate(${rot}) scale(${flip ? -s : s} ${s})`, o);
}

/** Coroa solta (para a coroa voando). */
export function crownAlone({ x, y, s = 1, rot = 0, ink = INK }) {
  const o = `<path d="M-24 10 L-26 -16 L-14 -2 L-7 -22 L0 -4 L7 -22 L14 -2 L26 -16 L24 10 Z" fill="${C.gold}" stroke="${ink}" stroke-width="4" stroke-linejoin="round"/>
    <circle cx="0" cy="2" r="4.5" fill="#e0263a" stroke="${ink}" stroke-width="2"/>`;
  return g(`translate(${x} ${y}) rotate(${rot}) scale(${s})`, o);
}

// ---------- o Dono (cabeça de boneco quebra-nozes, centro ~ no nariz) ----------
export function owner({ x, y, s = 1, rot = 0, ink = INK, sw = 6, lit = 1 }) {
  const ol = `stroke="${ink}" stroke-width="${sw}" stroke-linejoin="round"`;
  const o = `
    <path d="M-150 150 Q0 120 150 150 L170 260 L-170 260 Z" fill="#191020" ${ol}/>
    <path d="M-40 120 L0 150 L40 120 L30 200 L0 170 L-30 200 Z" fill="#f2ead8" ${ol}/>
    <path d="M0 150 L-46 128 L-46 172 Z M0 150 L46 128 L46 172 Z" fill="#c42a34" ${ol}/><circle cx="0" cy="150" r="10" fill="#9a1a24" ${ol}/>
    <path d="M-96 -70 Q-104 70 -70 118 Q0 150 70 118 Q104 70 96 -70 Q0 -96 -96 -70 Z" fill="#e6c49a" ${ol}/>
    <path d="M60 -60 Q90 20 62 110 Q90 70 92 -60 Z" fill="#c29a6c" opacity=".7"/>
    <path d="M-70 60 L-70 122 M70 60 L70 122" stroke="${ink}" stroke-width="5"/>
    <path d="M-62 52 Q0 70 62 52 L58 124 Q0 140 -58 124 Z" fill="#2a0a10" ${ol}/>
    <path d="M-54 58 L54 58 L52 78 L-52 78 Z" fill="#f6efe2" stroke="${ink}" stroke-width="3"/>
    <path d="M-36 58 L-36 78 M-18 58 L-18 78 M0 58 L0 78 M18 58 L18 78 M36 58 L36 78" stroke="${ink}" stroke-width="3"/>
    <path d="M-50 122 L-50 108 L50 108 L50 122" fill="#f6efe2" stroke="${ink}" stroke-width="3"/>
    <circle cx="-60" cy="30" r="15" fill="#ee7a6a" opacity=".75"/><circle cx="60" cy="30" r="15" fill="#ee7a6a" opacity=".75"/>
    <circle cx="-38" cy="-18" r="27" fill="#fbf5e8" ${ol}/><circle cx="38" cy="-18" r="27" fill="#fbf5e8" ${ol}/>
    <circle cx="-34" cy="-4" r="11" fill="${ink}"/><circle cx="34" cy="-4" r="11" fill="${ink}"/>
    <circle cx="-30" cy="-8" r="3.5" fill="#fff"/><circle cx="38" cy="-8" r="3.5" fill="#fff"/>
    <path d="M-66 -24 Q-38 -52 -10 -26 L-10 -40 Q-38 -60 -66 -40 Z" fill="#e6c49a" ${ol}/>
    <path d="M66 -24 Q38 -52 10 -26 L10 -40 Q38 -60 66 -40 Z" fill="#e6c49a" ${ol}/>
    <path d="M-72 -56 L-8 -42 M72 -56 L8 -42" stroke="${ink}" stroke-width="11" stroke-linecap="round"/>
    <circle cx="0" cy="22" r="15" fill="#d8443a" ${ol}/><circle cx="-4" cy="17" r="4" fill="#fff" opacity=".6"/>
    <path d="M-48 40 Q-24 26 0 38 Q24 26 48 40 Q24 48 0 42 Q-24 48 -48 40 Z" fill="#f6efe2" stroke="${ink}" stroke-width="4"/>
    <path d="M-130 -76 Q0 -110 130 -76 Q0 -54 -130 -76 Z" fill="#17121c" ${ol}/>
    <path d="M-74 -86 L-80 -236 Q0 -252 80 -236 L74 -86 Q0 -74 -74 -86 Z" fill="#17121c" ${ol}/>
    <path d="M-76 -118 Q0 -106 76 -118 L76 -98 Q0 -86 -76 -98 Z" fill="#8a1a2a" stroke="${ink}" stroke-width="4"/>
    <path d="M-60 -226 L-56 -130" stroke="#3a3040" stroke-width="10" stroke-linecap="round" opacity=".7"/>`;
  return g(`translate(${x} ${y}) rotate(${rot}) scale(${s})`, `<g opacity="${lit}">${o}</g>`);
}

/** Luva de desenho animado (mão do Dono). Pivô no punho. */
export function glove({ x, y, s = 1, rot = 0, ink = INK, flip = false }) {
  const o = `<path d="M-18 0 L-22 -30 Q-40 -40 -36 -60 Q-30 -70 -22 -58 L-20 -50 L-22 -86 Q-20 -96 -11 -94 Q-4 -92 -4 -82 L-3 -62 L-2 -96 Q0 -106 9 -104 Q17 -102 16 -92 L14 -62 L18 -88 Q20 -98 28 -95 Q35 -92 33 -82 L28 -54 L32 -70 Q36 -78 42 -74 Q47 -70 44 -60 L34 -22 Q30 -6 18 0 Z" fill="#fbf7ee" stroke="${ink}" stroke-width="5" stroke-linejoin="round"/>
    <rect x="-24" y="-4" width="46" height="18" rx="7" fill="#fbf7ee" stroke="${ink}" stroke-width="5"/>
    <path d="M-12 -40 L-10 -26 M6 -42 L6 -28 M22 -38 L18 -26" stroke="${ink}" stroke-width="3" stroke-linecap="round" opacity=".6"/>`;
  return g(`translate(${x} ${y}) rotate(${rot}) scale(${flip ? -s : s} ${s})`, o);
}

// ---------- fundos e efeitos ----------
export function defs() {
  return `<defs>
    <filter id="grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter>
    <filter id="blur8"><feGaussianBlur stdDeviation="8"/></filter>
    <filter id="blur20" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="20"/></filter>
    <filter id="blur40" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="40"/></filter>
    <filter id="redglow" x="-200%" y="-200%" width="500%" height="500%"><feGaussianBlur stdDeviation="2.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <pattern id="halftone" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><circle cx="7" cy="7" r="3.2" fill="#000"/></pattern>
    <pattern id="halftoneS" width="9" height="9" patternUnits="userSpaceOnUse" patternTransform="rotate(30)"><circle cx="4.5" cy="4.5" r="2" fill="#000"/></pattern>
  </defs>`;
}

export function grain(W, H, op = 0.09) {
  return `<rect width="${W}" height="${H}" filter="url(#grain)" opacity="${op}" style="mix-blend-mode:overlay"/>`;
}

export function vignette(W, H, id, op = 0.75, col = '#000') {
  return `<radialGradient id="${id}" cx="50%" cy="50%" r="75%"><stop offset="55%" stop-color="${col}" stop-opacity="0"/><stop offset="100%" stop-color="${col}" stop-opacity="${op}"/></radialGradient>
    <rect width="${W}" height="${H}" fill="url(#${id})"/>`;
}

export function sunburst(cx, cy, R, n, col, op = 1, phase = 0) {
  let o = '';
  for (let i = 0; i < n; i++) {
    const a0 = phase + (i / n) * Math.PI * 2, a1 = a0 + Math.PI / n;
    o += `<path d="M${cx} ${cy} L${cx + Math.cos(a0) * R} ${cy + Math.sin(a0) * R} L${cx + Math.cos(a1) * R} ${cy + Math.sin(a1) * R} Z"/>`;
  }
  return `<g fill="${col}" opacity="${op}">${o}</g>`;
}

export function star4(x, y, r, col = '#fff', rot = 0) {
  const k = r * 0.22;
  return `<path transform="translate(${x} ${y}) rotate(${rot})" d="M0 ${-r} Q${k} ${-k} ${r} 0 Q${k} ${k} 0 ${r} Q${-k} ${k} ${-r} 0 Q${-k} ${-k} 0 ${-r} Z" fill="${col}"/>`;
}

export function puff(x, y, r, col = '#f6ead0', ink = INK, seed = 3, sw = 4) {
  const R = rng(seed);
  let o = '';
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + R();
    o += `<circle cx="${x + Math.cos(a) * r * 0.7}" cy="${y + Math.sin(a) * r * 0.45}" r="${r * (0.45 + R() * 0.3)}"/>`;
  }
  return `<g fill="${col}" stroke="${ink}" stroke-width="${sw}">${o}</g><g fill="${col}">${o}</g>`;
}

/** Explosão em quadrinho: estrela irregular. */
export function burst(cx, cy, r1, r2, n, col, ink = INK, sw = 6, seed = 7, rot = 0) {
  const R = rng(seed);
  const pts = [];
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i / (n * 2)) * Math.PI * 2;
    const r = i % 2 ? r1 * (0.55 + R() * 0.2) : r2 * (0.85 + R() * 0.3);
    pts.push(`${cx + Math.cos(a) * r},${cy + Math.sin(a) * r}`);
  }
  return `<polygon points="${pts.join(' ')}" fill="${col}" stroke="${ink}" stroke-width="${sw}" stroke-linejoin="round"/>`;
}

// ---------- logo ----------
/**
 * Escreve DOMINOTION como letreiro com volume (extrusão), contorno e letras que vão tombando para a direita.
 * Roda no navegador (mede as letras com a fonte carregada) e devolve o SVG.
 */
export function logo(svgEl, o) {
  const {
    text = 'DOMINOTION', cx, cy, size, font = 'Lilita One', weight = 400, fill = C.ivory, ink = INK, ext = C.orange,
    depth = size * 0.09, sw = size * 0.075, tilt = 0, track = size * 0.02, glow, glowOp = 0.55, rot = 0, grad, shine = true, maxW,
  } = o;
  const NS = 'http://www.w3.org/2000/svg';
  const meas = document.createElementNS(NS, 'text');
  meas.setAttribute('font-family', font); meas.setAttribute('font-size', size); meas.setAttribute('font-weight', weight);
  svgEl.appendChild(meas);
  const widths = [...text].map((ch) => { meas.textContent = ch; return meas.getComputedTextLength(); });
  meas.remove();
  let k = 1;
  const total0 = widths.reduce((a, b) => a + b, 0) + track * (text.length - 1);
  if (maxW && total0 > maxW) k = maxW / total0;
  const fs = size * k, T = track * k, D = depth * k, SW = sw * k;
  const ws = widths.map((w) => w * k);
  const total = ws.reduce((a, b) => a + b, 0) + T * (text.length - 1);
  const base = cy + fs * 0.36;
  let x = cx - total / 2;
  const letters = [...text].map((ch, i) => {
    const w = ws[i];
    const r = tilt * Math.pow(i / (text.length - 1), 1.5);
    const L = { ch, x, w, r };
    x += w + T;
    return L;
  });
  const t = (L, dy, attrs) => `<text x="${L.x}" y="${base + dy}" font-family="${font}" font-size="${fs}" font-weight="${weight}" ${attrs}>${L.ch}</text>`;
  const wrap = (L, s) => `<g transform="rotate(${L.r} ${L.x + L.w} ${base})">${s}</g>`;
  const steps = Math.max(1, Math.round(D / 1.5));
  let back = '', mid = '', front = '';
  for (const L of letters) {
    let sk = '', fl = '';
    for (let s = steps; s >= 1; s--) {
      const dy = (D * s) / steps;
      sk += t(L, dy, `fill="${ink}" stroke="${ink}" stroke-width="${SW * 2}" stroke-linejoin="round"`);
      fl += t(L, dy, `fill="${ext}"`);
    }
    back += wrap(L, sk);
    mid += wrap(L, fl);
    const face = grad ? `url(#${grad})` : fill;
    front += wrap(L, t(L, 0, `fill="${face}" stroke="${ink}" stroke-width="${SW}" stroke-linejoin="round" paint-order="stroke fill"`));
    if (shine) front += wrap(L, t(L, 0, `fill="#fff" opacity=".22" clip-path="url(#logoshine)"`));
  }
  const gl = glow ? `<g filter="url(#blur20)" opacity="${glowOp}">${letters.map((L) => wrap(L, t(L, D / 2, `fill="${glow}" stroke="${glow}" stroke-width="${SW * 4}"`))).join('')}</g>` : '';
  const clip = `<clipPath id="logoshine"><rect x="${cx - total}" y="${base - fs}" width="${total * 2}" height="${fs * 0.42}"/></clipPath>`;
  const g_ = document.createElementNS(NS, 'g');
  g_.setAttribute('transform', `rotate(${rot} ${cx} ${cy})`);
  g_.innerHTML = clip + gl + back + mid + front;
  svgEl.appendChild(g_);
  return { width: total, height: fs, el: g_, base };
}
