// Trailer v4: gera "marketing 4/composition/index.html" (composição HyperFrames) a partir da tabela de cenas
// de trailer4.mjs. Rode depois de `node e2e/trailer/trailer4.mjs`.
// node e2e/trailer/trailer4-html.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { SCENES, TOTAL, COMP } from './trailer4.mjs';

const SC = Object.fromEntries(SCENES.map((s) => [s.id, s]));
const st = (id) => SC[id].start;
const r3 = (n) => +n.toFixed(3);

// ---------- textos (strings reais do jogo em inglês: web/src/i18n.en.ts) ----------
const OWNER = {
  sweep: 'You made it this far. Too bad.',
  shop: 'Come to shop? Everything here has a price.',
  press: 'The press marks forever. Choose well.',
  altar: 'The altar listens. Pay, and it answers.',
  gift: "Brought you a little gift. You can't refuse.",
};
const EVENTS = { shop: 'Shop', press: 'Seal Press', altar: 'Mystic Altar', gift: "Owner's Gift" };
// peças: cor e pinta de web/src/core/pieces.ts; (x, y, raio) do destaque no quadro congelado
const ROSTER = {
  trifork: { name: 'Tri-fork', desc: 'The chain splits in three!', color: '#d6457a', pip: '#2a0a16', pips: [3, 3], spot: [1250, 470, 230] },
  hopper: { name: 'Hopper', desc: 'Leaps over walls.', color: '#4fae5c', pip: '#0f2412', pips: [1, 2], spot: [1575, 175, 215] },
  rocket: { name: 'Rocket', desc: 'Runs over anyone in line.', color: '#f2c14e', pip: '#3a2a12', pips: [2, 1], spot: [1640, 400, 200] },
  blast: { name: 'Blast', desc: 'Knocks down everything around!', color: '#e5493a', pip: '#ffe9b0', pips: [3, 2], spot: [1560, 235, 245] },
};

// ---------- pedaços de HTML ----------
const words = (txt, cls = 'w') => txt.split(' ').map((w) => `<span class="${cls}"><i>${w}</i></span>`).join(' ');
const chars = (txt) => [...txt].map((c) => (c === ' ' ? '<b class="sp"> </b>' : `<b>${c}</b>`)).join('');
const pipDots = (n) => `<div class="half">${Array.from({ length: n }, () => '<s></s>').join('')}</div>`;

function shotHtml(s) {
  const v = `<div class="shot" id="w-${s.id}"><video id="v-${s.id}" src="assets/shots/${s.id}.mp4" data-start="${s.start}" data-duration="${s.dur}" data-track-index="0" data-has-audio="true" playsinline></video></div>`;
  if (!s.freeze) return v;
  const R = ROSTER[s.id];
  const [x, y, r] = R.spot;
  return v + `
    <div class="clip still" id="f-${s.id}" data-start="${r3(s.start + s.dur)}" data-duration="${s.freeze}" data-track-index="1">
      <div class="inner" style="transform-origin:${x}px ${y}px"><img src="assets/stills/${s.id}.jpg" alt="" /></div>
      <div class="spot" style="background:radial-gradient(circle at ${x}px ${y}px, rgba(7,5,8,0) ${r}px, rgba(7,5,8,.66) ${r + 260}px)"></div>
      <svg class="ring" viewBox="0 0 1920 1080" data-layout-allow-overflow><circle cx="${x}" cy="${y}" r="${r - 18}" pathLength="1" /></svg>
    </div>`;
}

function rosterCard(id) {
  const R = ROSTER[id];
  return `
    <div class="clip pcard-clip" id="card-${id}" data-start="${r3(st(id) + SC[id].dur)}" data-duration="${r3(SC[id].freeze + (id === 'blast' ? 0.45 : 0))}" data-track-index="5">
      <div class="pcard">
        <div class="tile" style="--c:${R.color};--p:${R.pip}">${pipDots(R.pips[0])}<div class="bar"></div>${pipDots(R.pips[1])}</div>
        <div class="ptext"><div class="pname">${chars(R.name.toUpperCase())}</div><div class="pdesc">${R.desc}</div></div>
      </div>
    </div>`;
}

function enemyCard(id, badge, name, desc, hp, start, dur) {
  return `
    <div class="clip ecard-clip" id="card-${id}" data-start="${r3(start)}" data-duration="${r3(dur)}" data-track-index="5">
      <div class="ecard">
        <div class="badge">${badge}</div>
        <div class="ename">${chars(name)}</div>
        <div class="hp">${Array.from({ length: hp }, () => '<s></s>').join('')}<em>${hp} hits</em></div>
        <div class="edesc">${desc}</div>
      </div>
    </div>`;
}

function balloon(id, start, dur, label = '', cls = '') {
  return `
    <div class="clip owner${cls}" id="ow-${id}" data-start="${r3(start)}" data-duration="${r3(dur)}" data-track-index="6">
      ${label ? `<div class="owner-tag">${label}</div>` : ''}
      <div class="speech">${chars(OWNER[id])}</div>
    </div>`;
}

const step = (id, num, txt, start, dur) => `
    <div class="clip step" id="cap-${id}" data-start="${r3(start)}" data-duration="${r3(dur)}" data-track-index="4">
      <div class="num">${num}<span> / 03</span></div>
      <div class="rule"></div>
      <div class="head txt">${words(txt)}</div>
    </div>`;

const header = (id, txt, start, dur) => `
    <div class="clip header" id="hd-${id}" data-start="${r3(start)}" data-duration="${r3(dur)}" data-track-index="3">
      <div class="hd txt">${words(txt)}</div>
    </div>`;

// fileira de dominós da tela final
const LOGO = 'DOMINOTION';
const tiles = [...LOGO].map((c, i) => `
          <div class="tile3" id="t3-${i}" style="left:${i * 150}px" data-layout-allow-overlap data-layout-allow-occlusion>
            <div class="face up"><span>${c}</span></div>
            <div class="face back"><div class="eyes calm"><b>o</b><b>o</b></div><div class="eyes scared"><b>&gt;</b><b>&lt;</b></div><div class="mouth"></div></div>
          </div>`).join('');

// ---------- som ----------
// [id, arquivo, início, duração, volume]
const sfx = [];
const add = (file, at, vol, dur) => sfx.push([file, r3(at), vol, dur]);
const DUR = { 'bong_001.ogg': 0.12, 'card-place-2.ogg': 0.46, 'card-slide-1.ogg': 0.6, 'impactBell_heavy_000.ogg': 1.48, 'impactBell_heavy_004.ogg': 0.3, 'impactSoft_heavy_001.ogg': 0.57, 'impactSoft_heavy_003.ogg': 0.54, 'impactSoft_medium_001.ogg': 0.18, 'impactSoft_medium_002.ogg': 0.135, 'impactSoft_medium_004.ogg': 0.147, 'impactWood_heavy_001.ogg': 0.31 };
const KEYS = ['keypress-001.wav', 'keypress-004.wav', 'keypress-007.wav', 'keypress-010.wav', 'keypress-013.wav', 'keypress-016.wav'];
const WOOD = ['impactWood_medium_000.ogg', 'impactWood_medium_002.ogg', 'impactWood_medium_001.ogg', 'impactWood_medium_004.ogg', 'impactWood_medium_003.ogg'];

// tempos de animação compartilhados com o script da página
const T = {
  boom: r3(st('kaboom') + 0.4),          // flash da Explosiva (quadro 10.4 s da tomada, em câmera lenta)
  click: r3(st('push') + 0.55),          // o cursor aperta FIRE!
  wavePunch: 16.0,                       // beat-locked: 16.02
  toppleStart: r3(st('end') + 0.7),
  toppleGap: 0.11,
  toppleFall: 0.34,
};
T.toppleDone = r3(T.toppleStart + (LOGO.length - 1) * T.toppleGap + T.toppleFall);

const TYPE = 0.024; // s por letra nas falas do Dono
const ownerTimes = {};
function typed(id, start) {
  ownerTimes[id] = start;
  const n = OWNER[id].length;
  for (let i = 0; i < n; i += 4) if (OWNER[id][i] !== ' ') add(KEYS[(i / 4) % KEYS.length], start + i * TYPE, 0.22, 0.25);
}

add('impactSoft_heavy_001.ogg', T.boom - 0.02, 0.9);
typed('sweep', st('sweep') + 0.4);
add('impactBell_heavy_000.ogg', st('ident'), 0.55);
add('impactSoft_medium_001.ogg', st('plan') + 0.2, 0.55);
add('impactSoft_medium_002.ogg', st('push') + 0.05, 0.55);
add('impactSoft_medium_001.ogg', st('wave'), 0.7);
add('impactSoft_medium_004.ogg', st('trick') + 0.1, 0.5);
for (const id of Object.keys(ROSTER)) {
  const at = st(id) + SC[id].dur;
  add('impactSoft_heavy_003.ogg', at - 0.01, 0.6);
  add('card-slide-1.ogg', at + 0.12, 0.6);
}
add('impactSoft_medium_004.ogg', st('ogre') + 0.05, 0.5);
add('impactWood_heavy_001.ogg', st('ogre') + 0.55, 0.6);
add('impactWood_heavy_001.ogg', st('general') + 0.25, 0.6);
for (const id of Object.keys(EVENTS)) { add('bong_001.ogg', st(id) + 0.15, 0.45); typed(id, st(id) + 0.45); }
add('impactSoft_medium_001.ogg', st('c4') + 0.1, 0.6);
add('impactSoft_medium_002.ogg', st('c4') + 0.5, 0.6);
for (let i = 0; i < LOGO.length; i++) add(WOOD[i % WOOD.length], T.toppleStart + i * T.toppleGap + T.toppleFall - 0.01, 0.5, 0.33);
add('impactBell_heavy_000.ogg', T.toppleDone + 0.05, 0.55);
add('impactBell_heavy_004.ogg', T.toppleDone + 0.05, 0.45);
add('card-place-2.ogg', st('end') + 3.6, 0.4);

const sfxHtml = sfx.map(([f, at, vol, d], i) => `<audio id="sfx-${i}" src="assets/sfx/${f}" data-start="${at}" data-duration="${d ?? DUR[f]}" data-volume="${vol}" data-track-index="${20 + (i % 8)}"></audio>`).join('\n    ');

// trilha: batidas da música em N.02 s → começa 0.02 s adiantada para cair nos segundos inteiros
const musicLane = JSON.stringify({ version: 1, lanes: [{ target: 'volume', points: [
  { t: 0, v: 1 }, { t: T.boom - 0.05, v: 1 }, { t: T.boom + 0.05, v: 0.5 }, { t: st('sweep') + 0.3, v: 0.8 }, { t: st('plan'), v: 0.95 },
  { t: st('boom') - 0.05, v: 0.95 }, { t: st('boom') + 0.05, v: 0.7 }, { t: st('boom') + 1.2, v: 0.95 },
  { t: st('c3') - 0.05, v: 0.95 }, { t: st('c3') + 0.05, v: 0.7 }, { t: st('c3') + 1.3, v: 0.95 },
  { t: st('end') + 0.3, v: 0.95 }, { t: st('end') + 1.2, v: 0.4 }, { t: TOTAL - 1.2, v: 0.3 }, { t: TOTAL - 0.05, v: 0 },
].map((p) => ({ t: r3(p.t), v: p.v })) }] });

// brilho quente que respira com o grave da trilha (15 amostras/s, já suavizado)
const AD = JSON.parse(readFileSync(path.join(COMP, 'assets', 'music', 'music-yt4.audio.json'), 'utf8'));
const glow = [];
let sm = 0;
for (let t = 0; t < TOTAL; t += 1 / 15) {
  const f = AD.frames[Math.min(AD.frames.length - 1, Math.round((t + 0.02) * AD.fps))];
  const e = Math.min(1, (f.bands[0] + f.bands[1]) * 0.9 + f.rms * 0.6);
  sm = sm * 0.6 + e * 0.4;
  glow.push(+sm.toFixed(2));
}

const fonts = [['Fell', 'im-fell-english-sc-latin-400-normal', 400], ['Pix', 'silkscreen-latin-400-normal', 400], ['Pix', 'silkscreen-latin-700-normal', 700],
  ['Nunito', 'nunito-latin-600-normal', 600], ['Nunito', 'nunito-latin-800-normal', 800], ['Nunito', 'nunito-latin-900-normal', 900]]
  .map(([f, file, w]) => `@font-face { font-family: ${f}; src: url(assets/fonts/${file}.woff2) format('woff2'); font-weight: ${w}; font-display: block; }`).join('\n      ');

const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1920, height=1080" />
    <title>DOMINOTION — trailer v4</title>
    <!-- gerado por web/e2e/trailer/trailer4-html.mjs — edite lá e gere de novo -->
    <script src="assets/vendor/gsap.min.js"></script>
    <style>
      ${fonts}
      :root {
        --bg: #070508; --cream: #e8dcc0; --speech: #f0e4c8; --gold: #d6b25a; --gold-2: #f0d48a; --red: #a3201c; --red-2: #d6402e;
        --line: #6a5030; --ink: #140e0a; --muted: #b8a888;
      }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { width: 1920px; height: 1080px; overflow: hidden; background: var(--bg); }
      #root { position: relative; width: 100%; height: 100%; overflow: hidden; background: var(--bg); font-family: Nunito, sans-serif; color: var(--cream); }
      #cam { position: absolute; inset: 0; }
      .shot { position: absolute; inset: 0; }
      .shot video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
      #w-ident { filter: blur(9px) brightness(.42) saturate(.8); }
      #w-end { filter: blur(10px) brightness(.34) saturate(.7); }
      .still { overflow: hidden; }
      .still .inner { position: absolute; inset: 0; }
      .still img { width: 100%; height: 100%; display: block; }
      .still .spot { position: absolute; inset: 0; }
      .still .ring { position: absolute; inset: 0; width: 100%; height: 100%; }
      .still .ring circle { fill: none; stroke: var(--gold-2); stroke-width: 5; stroke-dasharray: 1; stroke-dashoffset: 1; filter: drop-shadow(0 0 10px rgba(240, 212, 138, .7)); }

      .fill { position: absolute; inset: 0; pointer-events: none; }
      #vig { background: radial-gradient(ellipse 75% 70% at 50% 48%, rgba(7, 5, 8, 0) 55%, rgba(7, 5, 8, .55) 100%); }
      #warm { background: radial-gradient(ellipse 70% 45% at 50% 108%, rgba(201, 130, 42, .5), rgba(201, 130, 42, 0) 70%); opacity: 0; mix-blend-mode: screen; }
      #flash { background: #fff4dc; opacity: 0; }
      .lb { position: absolute; left: 0; right: 0; height: 138px; background: #000; }
      #lb-top { top: 0; transform-origin: 50% 0%; }
      #lb-bot { bottom: 0; transform-origin: 50% 100%; }

      .txt { font-family: Fell, serif; color: var(--cream); letter-spacing: .04em; line-height: 1;
        text-shadow: 0 .045em 0 #3a0808, 0 0 .3em rgba(0, 0, 0, .9), 0 .12em .35em rgba(0, 0, 0, .8); }
      .w { display: inline-block; overflow: hidden; padding: .06em .02em .1em; margin: -.06em 0 -.1em; vertical-align: top; }
      .w i { display: inline-block; font-style: normal; }
      .scrim { position: absolute; pointer-events: none; }

      /* gancho */
      #cap-hook .line { position: absolute; left: 150px; top: 742px; font-size: 104px; }
      #cap-hook .gold i { color: var(--gold-2); }
      #kab { position: absolute; left: 0; right: 0; top: 330px; text-align: center; }
      #kab span { display: inline-block; font-family: Pix; font-weight: 700; font-size: 250px; color: #ff9a3c; -webkit-text-stroke: 12px #1a0505; paint-order: stroke fill;
        text-shadow: 0 18px 0 #1a0505, 0 0 60px rgba(255, 120, 40, .45); letter-spacing: .02em; }

      /* balão do Dono (o .speech do jogo, em escala de vídeo) */
      .owner .owner-tag { position: absolute; left: 1006px; top: 104px; font-family: Pix; font-size: 24px; letter-spacing: .22em; color: var(--gold-2);
        text-shadow: 0 2px 0 #000, 0 0 12px rgba(0, 0, 0, .9); }
      .owner .speech { position: absolute; left: 1000px; top: 146px; width: 760px; padding: 30px 40px 32px; font-family: Fell; font-size: 52px; line-height: 1.16;
        color: var(--speech); background: rgba(12, 8, 6, .93); border: 4px solid var(--line); border-radius: 26px 26px 26px 5px;
        box-shadow: 0 12px 0 rgba(0, 0, 0, .45), 0 28px 60px rgba(0, 0, 0, .6); }
      .owner.lbsafe .owner-tag { top: 158px; }
      .owner.lbsafe .speech { top: 198px; }
      .speech b, .pname b, .ename b { font-weight: inherit; opacity: 0; }
      .speech b.sp { opacity: 1; }

      /* título */
      #title .logo { position: absolute; left: 0; right: 0; top: 368px; text-align: center; font-size: 214px; perspective: 900px;
        text-shadow: 0 7px 0 #4a0d0d, 0 0 50px rgba(160, 20, 20, .55), 0 14px 30px rgba(0, 0, 0, .7); }
      #title .logo b { display: inline-block; font-weight: 400; transform-origin: 50% 90%; }
      #title .sub { position: absolute; left: 0; right: 0; top: 628px; text-align: center; font-family: Fell; font-size: 48px; letter-spacing: .34em; color: var(--gold-2);
        text-shadow: 0 3px 0 #2a0505, 0 0 18px rgba(0, 0, 0, .9); }
      #title .sub-rule { position: absolute; top: 650px; width: 300px; height: 3px; background: linear-gradient(90deg, rgba(214, 178, 90, 0), var(--gold)); }
      #title .sub-rule.l { left: 250px; }
      #title .sub-rule.r { right: 250px; transform: scaleX(-1); }

      /* passos 01-03 */
      .step .scrim { left: 0; top: 560px; width: 1300px; height: 520px; background: radial-gradient(ellipse 60% 55% at 20% 75%, rgba(7, 5, 8, .62), rgba(7, 5, 8, 0) 75%); }
      .step .num { position: absolute; left: 136px; top: 690px; font-family: Pix; font-size: 34px; color: var(--gold-2); letter-spacing: .12em; text-shadow: 0 3px 0 #000, 0 0 14px rgba(0, 0, 0, .9); }
      .step .num span { color: var(--muted); }
      .step .rule { position: absolute; left: 136px; top: 744px; width: 560px; height: 4px; background: linear-gradient(90deg, var(--gold), rgba(214, 178, 90, 0)); transform-origin: 0 50%; }
      .step .head { position: absolute; left: 130px; top: 772px; font-size: 124px; white-space: nowrap; }

      /* cabeçalhos de seção */
      .header .hd { position: absolute; left: 130px; top: 96px; font-size: 92px; white-space: nowrap; transform-origin: 0 0; }

      /* cartas das peças */
      .pcard { position: absolute; left: 130px; top: 600px; isolation: isolate; display: flex; align-items: center; gap: 46px; }
      .pcard::before { content: ''; position: absolute; left: -130px; top: -140px; width: 1150px; height: 560px; z-index: -1;
        background: radial-gradient(ellipse 55% 50% at 30% 50%, rgba(7, 5, 8, .7), rgba(7, 5, 8, 0) 80%); }
      .tile { width: 150px; height: 290px; border-radius: 18px; background: var(--c); border: 4px solid rgba(0, 0, 0, .55); display: flex; flex-direction: column; align-items: stretch;
        box-shadow: 0 10px 0 rgba(0, 0, 0, .5), 0 24px 50px rgba(0, 0, 0, .65), inset 0 3px 0 rgba(255, 255, 255, .3), inset 0 -5px 0 rgba(0, 0, 0, .25); }
      .tile .half { flex: 1; display: flex; flex-wrap: wrap; align-content: center; justify-content: center; gap: 14px; padding: 18px; }
      .tile .half s { width: 26px; height: 26px; border-radius: 50%; background: var(--p); }
      .tile .bar { height: 6px; margin: 0 16px; border-radius: 3px; background: var(--p); opacity: .8; }
      .ptext { display: flex; flex-direction: column; gap: 18px; }
      .pname { font-family: Fell; font-size: 132px; line-height: .9; letter-spacing: .04em; color: var(--cream); text-shadow: 0 6px 0 #3a0808, 0 0 30px rgba(0, 0, 0, .9); white-space: nowrap; }
      .pdesc { font-family: Nunito; font-weight: 800; font-size: 44px; color: var(--speech); text-shadow: 0 3px 0 #000, 0 0 16px rgba(0, 0, 0, .95); white-space: nowrap; }

      /* inimigos */
      .ecard { position: absolute; left: 130px; top: 610px; isolation: isolate; }
      .ecard::before { content: ''; position: absolute; left: -130px; top: -160px; width: 1250px; height: 600px; z-index: -1;
        background: radial-gradient(ellipse 55% 50% at 30% 55%, rgba(7, 5, 8, .72), rgba(7, 5, 8, 0) 80%); }
      .badge { display: inline-block; font-family: Pix; font-weight: 700; font-size: 28px; letter-spacing: .2em; color: #ffe7d6; background: linear-gradient(180deg, #b3261c, #5a0c08);
        padding: 8px 18px 6px; border-radius: 8px; border: 2px solid rgba(0, 0, 0, .55); box-shadow: 0 4px 0 rgba(0, 0, 0, .5); }
      .ename { margin-top: 18px; font-family: Fell; font-size: 132px; line-height: .9; letter-spacing: .04em; color: var(--cream); text-shadow: 0 6px 0 #3a0808, 0 0 30px rgba(0, 0, 0, .9); white-space: nowrap; }
      .hp { margin-top: 16px; display: flex; align-items: center; gap: 12px; }
      .hp s { width: 30px; height: 30px; background: var(--red-2); transform: rotate(45deg); border: 3px solid #2a0505; box-shadow: 0 0 12px rgba(214, 64, 46, .6); }
      .hp em { margin-left: 14px; font-family: Pix; font-style: normal; font-size: 30px; color: #ffb4a6; letter-spacing: .1em; text-shadow: 0 2px 0 #000; }
      .edesc { margin-top: 18px; font-family: Nunito; font-weight: 800; font-size: 44px; color: var(--speech); text-shadow: 0 3px 0 #000, 0 0 16px rgba(0, 0, 0, .95); white-space: nowrap; }

      /* eventos */
      .evlabel .scrim { left: 0; top: 640px; width: 1100px; height: 440px; background: radial-gradient(ellipse 55% 55% at 20% 75%, rgba(7, 5, 8, .62), rgba(7, 5, 8, 0) 75%); }
      .evlabel .kick { position: absolute; left: 136px; top: 736px; font-family: Pix; font-size: 28px; letter-spacing: .2em; color: var(--gold-2); text-shadow: 0 2px 0 #000, 0 0 12px rgba(0, 0, 0, .9); }
      .evlabel .rule { position: absolute; left: 136px; top: 782px; width: 440px; height: 4px; background: linear-gradient(90deg, var(--gold), rgba(214, 178, 90, 0)); transform-origin: 0 50%; }
      .evlabel .name { position: absolute; left: 130px; top: 806px; font-size: 112px; white-space: nowrap; }

      /* frase final */
      #tag .scrim { left: 0; right: 0; top: 380px; height: 520px; background: radial-gradient(ellipse 50% 50% at 50% 50%, rgba(7, 5, 8, .7), rgba(7, 5, 8, 0) 80%); }
      #tag .l1, #tag .l2 { position: absolute; left: 0; right: 0; text-align: center; white-space: nowrap; }
      #tag .l1 { top: 500px; font-size: 128px; }
      #tag .l2 { top: 640px; font-size: 104px; }
      #tag .l2 .gold i { color: var(--gold-2); }

      /* tela final: fileira de dominós */
      #endcard .stage { position: absolute; left: 0; top: 0; width: 1920px; height: 1080px; perspective: 1700px; perspective-origin: 50% 20%; }
      #endcard .table { position: absolute; left: 216px; top: 300px; width: 1488px; height: 250px; transform-style: preserve-3d; transform-origin: 50% 100%; }
      .tile3 { position: absolute; top: 0; width: 138px; height: 250px; transform-style: preserve-3d; transform-origin: 50% 0%; }
      .tile3 .face { position: absolute; inset: 0; border-radius: 16px; backface-visibility: hidden; border: 4px solid rgba(0, 0, 0, .5); }
      .tile3 .up { background: #ebdfc6; display: grid; place-items: center; box-shadow: inset 0 3px 0 rgba(255, 255, 255, .55), inset 0 -6px 0 rgba(0, 0, 0, .18); }
      .tile3 .up span { font-family: Fell; font-size: 138px; line-height: 1; color: #1d1a17; margin-top: 18px; }
      .tile3 .back { background: #e6d9bd; transform: rotateX(180deg); box-shadow: inset 0 3px 0 rgba(255, 255, 255, .5), inset 0 -6px 0 rgba(0, 0, 0, .18); }
      .tile3 .eyes { position: absolute; left: 0; right: 0; top: 64px; display: flex; justify-content: center; gap: 26px; }
      .tile3 .eyes b { font-family: Nunito; font-weight: 900; font-size: 50px; line-height: 1; color: #1d1a17; }
      .tile3 .eyes.scared { opacity: 0; }
      .tile3 .mouth { position: absolute; left: 57px; top: 132px; width: 24px; height: 14px; border-radius: 0 0 14px 14px; background: #1d1a17; }
      #endcard .eshadow { position: absolute; left: 200px; top: 520px; width: 1520px; height: 120px; background: radial-gradient(ellipse 50% 50% at 50% 50%, rgba(0, 0, 0, .55), rgba(0, 0, 0, 0) 70%); }
      #endcard .rogue { position: absolute; left: 0; right: 0; top: 650px; text-align: center; font-family: Fell; font-size: 54px; letter-spacing: .34em; color: var(--gold-2);
        text-shadow: 0 3px 0 #2a0505, 0 0 18px rgba(0, 0, 0, .9); }
      #endcard .cta { position: absolute; left: 0; right: 0; top: 742px; display: flex; justify-content: center; }
      #endcard .btn { position: relative; overflow: hidden; font-family: Fell; font-size: 56px; letter-spacing: .06em; padding: 22px 70px 18px; border-radius: 16px; color: #fff3e0;
        background: linear-gradient(180deg, #b3261c, #5a0c08); border: 3px solid rgba(0, 0, 0, .6); text-shadow: 0 3px 0 rgba(0, 0, 0, .5);
        box-shadow: 0 9px 0 rgba(0, 0, 0, .55), inset 0 3px 0 rgba(255, 255, 255, .22), inset 0 -5px 0 rgba(0, 0, 0, .25), 0 0 40px rgba(214, 64, 46, .35); }
      #endcard .btn .sheen { position: absolute; top: -20px; bottom: -20px; left: 0; width: 120px; background: linear-gradient(100deg, rgba(255, 240, 210, 0), rgba(255, 240, 210, .45), rgba(255, 240, 210, 0)); }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${TOTAL}" data-width="1920" data-height="1080" data-fps="60">
      <div id="cam">
    ${SCENES.map(shotHtml).join('\n    ')}
      </div>
      <div id="warm" class="fill"></div>
      <div id="vig" class="fill"></div>

      <!-- 1-2 gancho -->
      <div class="clip" id="cap-hook" data-start="0" data-duration="${st('kaboom')}" data-track-index="4">
        <div class="line txt">${words('THEY KNOW')} <span class="gold">${words("WHAT'S COMING.")}</span></div>
      </div>
      <div class="clip" id="kaboom" data-start="${r3(T.boom)}" data-duration="${r3(SC.kaboom.end - T.boom)}" data-track-index="4"><div id="kab"><span>KABOOM!</span></div></div>
      ${balloon('sweep', st('sweep') + 0.25, SC.sweep.dur - 0.27, "THE TABLE'S OWNER", ' lbsafe')}

      <!-- 4 título -->
      <div class="clip" id="title" data-start="${st('ident')}" data-duration="${SC.ident.dur}" data-track-index="4">
        <div class="logo txt" data-layout-allow-overlap>${[...'DOMINOTION'].map((c) => `<b>${c}</b>`).join('')}</div>
        <div class="sub-rule l"></div><div class="sub">A DOMINO ROGUELIKE</div><div class="sub-rule r"></div>
      </div>

      <!-- 5-8 como se joga -->
      ${step('plan', '01', 'PLAN THE CHAIN.', st('plan') + 0.15, SC.plan.dur - 0.17)}
      ${step('push', '02', 'PUSH ONE PIECE.', st('push') + 0.02, SC.push.dur - 0.04)}
      ${step('topple', '03', 'TOPPLE EVERYTHING.', st('wave'), SC.wave.dur - 0.1)}

      <!-- 9-13 peças -->
      ${header('trick', 'EVERY PIECE HAS A TRICK.', st('trick') + 0.08, SC.boom.end - st('trick') - 0.1)}
      ${Object.keys(ROSTER).map(rosterCard).join('')}

      <!-- 14-15 inimigos -->
      ${header('fight', 'THEY FIGHT BACK.', st('ogre') + 0.05, SC.general.end - st('ogre') - 0.07)}
      ${enemyCard('ogre', 'ENEMY', 'OGRE', 'Topples like a giant domino.', 3, st('ogre') + 0.5, SC.ogre.dur - 0.52)}
      ${enemyCard('general', 'BOSS', 'THE GENERAL', 'A boss every 5 stages.', 4, st('general') + 0.2, SC.general.dur - 0.22)}

      <!-- 16-19 o Dono -->
      ${Object.entries(EVENTS).map(([id, name]) => `
      <div class="clip evlabel" id="ev-${id}" data-start="${r3(st(id) + 0.1)}" data-duration="${r3(SC[id].dur - 0.12)}" data-track-index="4">
        <div class="scrim"></div><div class="kick">BETWEEN STAGES</div><div class="rule"></div><div class="name txt">${words(name.toUpperCase())}</div>
      </div>${balloon(id, st(id) + 0.3, SC[id].dur - 0.32, id === 'shop' ? "THE TABLE'S OWNER" : '')}`).join('')}

      <!-- 20-23 clímax -->
      <div class="clip" id="tag" data-start="${r3(st('c4') + 0.05)}" data-duration="${r3(SC.c4.dur - 0.07)}" data-track-index="4">
        <div class="scrim"></div>
        <div class="l1 txt">${words('TOPPLE THEM')}</div>
        <div class="l2 txt">${words('BEFORE THEY')} <span class="gold">${words('TOPPLE YOU.')}</span></div>
      </div>

      <!-- 24 tela final -->
      <div class="clip" id="endcard" data-start="${st('end')}" data-duration="${SC.end.dur}" data-track-index="4">
        <div class="eshadow"></div>
        <div class="stage"><div class="table" id="etable">${tiles}
        </div></div>
        <div class="rogue">A DOMINO ROGUELIKE</div>
        <div class="cta"><div class="btn">WISHLIST NOW ON STEAM<div class="sheen"></div></div></div>
      </div>

      <div id="flash" class="fill"></div>
      <div id="lb-top" class="lb"></div>
      <div id="lb-bot" class="lb"></div>

      <audio id="music" src="assets/music/music-yt4.wav" data-start="0" data-duration="${TOTAL}" data-media-start="0.02" data-volume="0.9" data-track-index="10"
        data-automation='${musicLane}'></audio>
    ${sfxHtml}
    </div>
    <script>
      const SC = ${JSON.stringify(Object.fromEntries(SCENES.map((s) => [s.id, { s: s.start, d: s.dur, f: s.freeze, e: s.end }])))};
      const T = ${JSON.stringify(T)};
      const OWN = ${JSON.stringify(ownerTimes)};
      const TYPE = ${TYPE};
      const GLOW = ${JSON.stringify(glow)};
      const tl = gsap.timeline({ paused: true });
      const q = (s) => document.querySelectorAll(s);

      // ---------- câmera / luz ----------
      // 4% de margem: esconde a borda curva do efeito CRT do jogo nas explosões e dá folga para o tremor
      tl.set('#cam', { scale: 1.04 }, 0);
      // brilho quente (graves da trilha), 15 amostras por segundo
      GLOW.forEach((v, i) => tl.to('#warm', { opacity: 0.12 + v * 0.55, duration: 1 / 15, ease: 'none' }, i / 15));
      // tarja de cinema: abre no fim do título, fecha na tela final
      tl.fromTo('.lb', { scaleY: 1 }, { scaleY: 0, duration: 0.35, ease: 'power2.in' }, SC.ident.e - 0.38);
      tl.fromTo('.lb', { scaleY: 0 }, { scaleY: 1, duration: 0.45, ease: 'power3.out', immediateRender: false }, SC.end.s);

      // 1 gancho: empurrão lento nos rostos; palavras sobem uma a uma
      tl.fromTo('#w-faces', { scale: 1.0 }, { scale: 1.07, duration: SC.faces.d, ease: 'none', transformOrigin: '62% 45%' }, 0);
      tl.fromTo('#cap-hook .w i', { yPercent: 110 }, { yPercent: 0, duration: 0.5, ease: 'power4.out', stagger: 0.11 }, 0.18);
      tl.to('#cap-hook .line', { opacity: 0, duration: 0.14, ease: 'power2.in' }, SC.kaboom.s - 0.15);

      // 2 KABOOM: flash, tremor, palavra do jogo
      tl.fromTo('#flash', { opacity: 0 }, { opacity: 0.8, duration: 0.04, ease: 'none' }, T.boom - 0.02);
      tl.to('#flash', { opacity: 0, duration: 0.28, ease: 'power2.out' }, T.boom + 0.03);
      tl.fromTo('#cam', { x: 0, y: 0 }, { keyframes: [{ x: -22, y: 12, duration: 0.04 }, { x: 18, y: -14, duration: 0.05 }, { x: -11, y: 8, duration: 0.05 }, { x: 6, y: -4, duration: 0.05 }, { x: 0, y: 0, duration: 0.06 }], ease: 'none' }, T.boom);
      tl.fromTo('#kab span', { scale: 2.6, rotation: -14, opacity: 0 }, { scale: 1, rotation: -7, opacity: 1, duration: 0.2, ease: 'power4.out' }, T.boom);
      tl.fromTo('#kab span', { scale: 1 }, { scale: 1.08, duration: SC.kaboom.e - 0.15 - T.boom - 0.2, ease: 'none', immediateRender: false }, T.boom + 0.2);
      tl.fromTo('#kab span', { scale: 1.08, opacity: 1 }, { scale: 1.3, opacity: 0, duration: 0.14, ease: 'power2.in', immediateRender: false }, SC.kaboom.e - 0.15);

      // falas do Dono: o balão do jogo aparece e a fala é datilografada
      function owner(id, at, out) {
        const sel = '#ow-' + id;
        tl.fromTo(sel + ' .speech', { opacity: 0, y: 16, scale: 0.96 }, { opacity: 1, y: 0, scale: 1, duration: 0.25, ease: 'power2.out', transformOrigin: '0% 100%' }, at - 0.2);
        q(sel + ' .speech b:not(.sp)').forEach((b) => {
          const i = [...b.parentNode.children].indexOf(b);
          tl.set(b, { opacity: 1 }, OWN[id] + i * TYPE);
        });
        tl.to(sel + ' .speech', { opacity: 0, y: -8, duration: 0.16, ease: 'power2.in' }, out - 0.17);
      }
      // 3 a mão varre a mesa; câmera chega perto da máscara
      tl.fromTo('#w-sweep', { scale: 1.0 }, { scale: 1.07, duration: SC.sweep.d, ease: 'sine.inOut', transformOrigin: '50% 12%' }, SC.sweep.s);
      tl.fromTo('#ow-sweep .owner-tag', { opacity: 0, x: -14 }, { opacity: 1, x: 0, duration: 0.3, ease: 'power2.out' }, SC.sweep.s + 0.25);
      tl.to('#ow-sweep .owner-tag', { opacity: 0, duration: 0.15 }, SC.sweep.e - 0.18);
      owner('sweep', SC.sweep.s + 0.45, SC.sweep.e);

      // 4 título: as letras se levantam como dominós
      tl.fromTo('#w-ident', { scale: 1.12 }, { scale: 1.0, duration: SC.ident.d, ease: 'power1.out' }, SC.ident.s);
      tl.fromTo('#title .logo b', { rotationX: -100, opacity: 0 }, { rotationX: 0, opacity: 1, duration: 0.55, ease: 'back.out(1.7)', stagger: 0.045 }, SC.ident.s + 0.02);
      tl.fromTo('#title .sub', { opacity: 0, scale: 1.18 }, { opacity: 1, scale: 1, duration: 0.7, ease: 'expo.out' }, SC.ident.s + 0.55);
      tl.fromTo('#title .sub-rule', { scaleX: 0, opacity: 0 }, { scaleX: 1, opacity: 1, duration: 0.6, ease: 'expo.out', transformOrigin: '100% 50%' }, SC.ident.s + 0.6);
      tl.to('#title .logo, #title .sub, #title .sub-rule', { opacity: 0, duration: 0.18, ease: 'power2.in' }, SC.ident.e - 0.22);

      // 5-8 passos
      function stepIn(id, at, ease) {
        const s = '#cap-' + id;
        tl.fromTo(s + ' .num', { opacity: 0, x: -24 }, { opacity: 1, x: 0, duration: 0.3, ease: 'power2.out' }, at);
        tl.fromTo(s + ' .rule', { scaleX: 0 }, { scaleX: 1, duration: 0.5, ease: 'expo.out' }, at + 0.05);
        tl.fromTo(s + ' .head .w i', { yPercent: 105 }, { yPercent: 0, duration: 0.45, ease, stagger: 0.07 }, at + 0.08);
      }
      function stepOut(id, at) { tl.to('#cap-' + id + ' .num, #cap-' + id + ' .rule, #cap-' + id + ' .head', { opacity: 0, y: -10, duration: 0.18, ease: 'power2.in' }, at - 0.2); }
      stepIn('plan', SC.plan.s + 0.18, 'power4.out'); stepOut('plan', SC.plan.e - 0.02);
      tl.fromTo('#w-plan', { scale: 1.0 }, { scale: 1.05, duration: SC.plan.d, ease: 'none', transformOrigin: '45% 40%' }, SC.plan.s);
      tl.fromTo('#w-build', { scale: 1.08 }, { scale: 1.0, duration: SC.build.d, ease: 'power2.out' }, SC.build.s);
      stepIn('push', SC.push.s + 0.05, 'back.out(1.6)'); stepOut('push', SC.push.e - 0.02);
      // empurrão até o botão FIRE! e volta no clique
      // origem além do botão (canto): o zoom puxa o FIRE! para dentro do quadro em vez de empurrá-lo para a borda
      tl.fromTo('#w-push', { scale: 1.0 }, { scale: 1.35, duration: 0.42, ease: 'power2.inOut', transformOrigin: '100% 100%' }, SC.push.s + 0.05);
      tl.fromTo('#w-push', { scale: 1.35 }, { scale: 1.0, duration: 0.3, ease: 'expo.out', immediateRender: false }, T.click);
      // 03: TOPPLE bate no tempo forte (14.02)
      tl.fromTo('#cap-topple .num', { opacity: 0, x: -24 }, { opacity: 1, x: 0, duration: 0.3, ease: 'power2.out' }, SC.wave.s);
      tl.fromTo('#cap-topple .rule', { scaleX: 0 }, { scaleX: 1, duration: 0.5, ease: 'expo.out' }, SC.wave.s);
      tl.fromTo('#cap-topple .head .w', { scale: 1.7, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.24, ease: 'power4.out', stagger: 0.16, transformOrigin: '0% 80%' }, SC.wave.s);
      stepOut('topple', SC.wave.e - 0.08);
      tl.fromTo('#w-wave', { scale: 1.0 }, { scale: 1.12, duration: 0.3, ease: 'expo.out', transformOrigin: '55% 50%' }, T.wavePunch);
      tl.fromTo('#w-wave', { scale: 1.12 }, { scale: 1.16, duration: SC.wave.e - T.wavePunch - 0.3, ease: 'none', immediateRender: false }, T.wavePunch + 0.3);

      // 9-13 peças: cabeçalho grande que vira título de seção
      function headerIn(id, at, shrinkAt, end) {
        const s = '#hd-' + id + ' .hd';
        tl.fromTo(s + ' .w i', { yPercent: 105 }, { yPercent: 0, duration: 0.5, ease: 'power3.out', stagger: 0.06 }, at);
        tl.fromTo(s, { scale: 1, opacity: 1 }, { scale: 0.52, duration: 0.45, ease: 'power3.inOut' }, shrinkAt);
        tl.to(s, { opacity: 0, duration: 0.18, ease: 'power2.in' }, end - 0.2);
      }
      headerIn('trick', SC.trick.s + 0.1, SC.trifork.s + SC.trifork.d - 0.05, SC.boom.e);
      tl.fromTo('#w-trick', { scale: 1.0 }, { scale: 1.06, duration: SC.trick.d, ease: 'none', transformOrigin: '60% 45%' }, SC.trick.s);
      ['trifork', 'hopper', 'rocket', 'blast'].forEach((id, k) => {
        const f = SC[id].s + SC[id].d, d = SC[id].f, c = '#card-' + id;
        tl.fromTo('#f-' + id + ' .inner', { scale: 1 }, { scale: 1.08, duration: d, ease: 'power1.out' }, f);
        tl.fromTo('#f-' + id + ' .spot', { opacity: 0 }, { opacity: 1, duration: 0.22, ease: 'power2.out' }, f);
        tl.fromTo('#f-' + id + ' .ring circle', { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.4, ease: 'power2.inOut' }, f + 0.05);
        tl.fromTo('#flash', { opacity: 0.32 }, { opacity: 0, duration: 0.3, ease: 'power2.out', immediateRender: false }, f);
        const from = [{ x: -260, rotation: -16 }, { y: 220, rotation: 10 }, { x: -260, rotation: 12 }, { y: 220, rotation: -10 }][k];
        tl.fromTo(c + ' .tile', { opacity: 0, ...from }, { opacity: 1, x: 0, y: 0, rotation: k % 2 ? 4 : -4, duration: 0.42, ease: 'back.out(1.5)' }, f + 0.1);
        q(c + ' .pname b').forEach((b, i) => tl.fromTo(b, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.3, ease: 'power3.out' }, f + 0.2 + i * 0.03));
        tl.fromTo(c + ' .pdesc', { opacity: 0, y: 16 }, { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out' }, f + 0.42);
        const out = f + d + (id === 'blast' ? 0.45 : 0);
        tl.to(c + ' .pcard', { opacity: 0, x: -40, duration: 0.16, ease: 'power2.in' }, out - 0.18);
      });
      tl.fromTo('#flash', { opacity: 0.45 }, { opacity: 0, duration: 0.4, ease: 'power2.out', immediateRender: false }, SC.boom.s);
      tl.fromTo('#cam', { x: 0, y: 0 }, { keyframes: [{ x: 16, y: -10, duration: 0.05 }, { x: -12, y: 9, duration: 0.05 }, { x: 6, y: -4, duration: 0.05 }, { x: 0, y: 0, duration: 0.06 }], ease: 'none', immediateRender: false }, SC.boom.s);

      // 14-15 inimigos
      headerIn('fight', SC.ogre.s + 0.08, SC.ogre.s + 1.2, SC.general.e);
      function enemyIn(id, at, end) {
        const c = '#card-' + id;
        tl.fromTo(c + ' .badge', { opacity: 0, scale: 0.4 }, { opacity: 1, scale: 1, duration: 0.3, ease: 'back.out(2.2)', transformOrigin: '0% 50%' }, at);
        q(c + ' .ename b').forEach((b, i) => tl.fromTo(b, { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: 0.28, ease: 'power3.out' }, at + 0.08 + i * 0.03));
        q(c + ' .hp s').forEach((s, i) => tl.fromTo(s, { scale: 0 }, { scale: 1, duration: 0.25, ease: 'back.out(2.5)' }, at + 0.35 + i * 0.07));
        tl.fromTo(c + ' .hp em, ' + c + ' .edesc', { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.3, ease: 'power2.out', stagger: 0.1 }, at + 0.45);
        tl.to(c + ' .ecard', { opacity: 0, x: -40, duration: 0.16, ease: 'power2.in' }, end - 0.18);
      }
      enemyIn('ogre', SC.ogre.s + 0.5, SC.ogre.e);
      enemyIn('general', SC.general.s + 0.2, SC.general.e);
      tl.fromTo('#w-ogre', { scale: 1.06 }, { scale: 1.0, duration: SC.ogre.d, ease: 'power1.out', transformOrigin: '52% 35%' }, SC.ogre.s);
      tl.fromTo('#w-general', { scale: 1.0 }, { scale: 1.1, duration: SC.general.d, ease: 'none', transformOrigin: '48% 22%' }, SC.general.s);

      // 16-19 o Dono: um evento por vez
      ['shop', 'press', 'altar', 'gift'].forEach((id, k) => {
        const s = SC[id].s, e = SC[id].e, l = '#ev-' + id;
        tl.fromTo('#w-' + id, { scale: 1.0 }, { scale: 1.06, duration: SC[id].d, ease: 'none', transformOrigin: k % 2 ? '60% 30%' : '40% 30%' }, s);
        tl.fromTo(l + ' .kick', { opacity: 0 }, { opacity: 1, duration: 0.25 }, s + 0.12);
        tl.fromTo(l + ' .rule', { scaleX: 0 }, { scaleX: 1, duration: 0.5, ease: 'expo.out' }, s + 0.12);
        tl.fromTo(l + ' .name .w i', { yPercent: 105 }, { yPercent: 0, duration: 0.42, ease: 'power3.out', stagger: 0.06 }, s + 0.15);
        tl.to(l + ' .kick, ' + l + ' .rule, ' + l + ' .name', { opacity: 0, duration: 0.15, ease: 'power2.in' }, e - 0.18);
        owner(id, s + 0.5, e - 0.02);
        if (id === 'shop') { tl.fromTo('#ow-shop .owner-tag', { opacity: 0, x: -14 }, { opacity: 1, x: 0, duration: 0.3, ease: 'power2.out' }, s + 0.3); tl.to('#ow-shop .owner-tag', { opacity: 0, duration: 0.15 }, e - 0.2); }
      });

      // 20-23 clímax
      tl.fromTo('#w-c1', { scale: 1.18 }, { scale: 1.0, duration: 0.45, ease: 'expo.out' }, SC.c1.s);
      tl.fromTo('#w-c2', { scale: 1.0 }, { scale: 1.1, duration: SC.c2.d, ease: 'power1.in', transformOrigin: '55% 45%' }, SC.c2.s);
      tl.fromTo('#flash', { opacity: 0.45 }, { opacity: 0, duration: 0.4, ease: 'power2.out', immediateRender: false }, SC.c3.s);
      tl.fromTo('#w-c3', { scale: 1.12 }, { scale: 1.02, duration: SC.c3.d, ease: 'power2.out' }, SC.c3.s);
      tl.fromTo('#w-c4', { scale: 1.1 }, { scale: 1.0, duration: SC.c4.d, ease: 'power1.out' }, SC.c4.s);
      tl.fromTo('#tag .l1 .w', { scale: 1.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.22, ease: 'power4.out', stagger: 0.12, transformOrigin: '50% 80%' }, SC.c4.s + 0.08);
      tl.fromTo('#tag .l2 .w i', { yPercent: 105 }, { yPercent: 0, duration: 0.42, ease: 'power3.out', stagger: 0.08 }, SC.c4.s + 0.5);
      tl.to('#tag .l1, #tag .l2, #tag .scrim', { opacity: 0, duration: 0.16, ease: 'power2.in' }, SC.c4.e - 0.18);

      // 24 tela final: dominós com rosto caem um a um e formam o nome
      tl.fromTo('#w-end', { scale: 1.12 }, { scale: 1.0, duration: SC.end.d, ease: 'power1.out' }, SC.end.s);
      tl.fromTo('#etable', { rotationX: 62, y: 40 }, { rotationX: 62, y: 0, duration: 0.6, ease: 'power2.out' }, SC.end.s);
      q('.tile3').forEach((t, i) => {
        const at = T.toppleStart + i * T.toppleGap;
        tl.set(t.querySelector('.calm'), { opacity: 0 }, at - 0.2);
        tl.set(t.querySelector('.scared'), { opacity: 1 }, at - 0.2);
        tl.fromTo(t, { rotationX: 90 }, { rotationX: 0, duration: T.toppleFall, ease: 'power2.in' }, at);
        tl.fromTo(t, { rotationX: 0 }, { keyframes: [{ rotationX: 7, duration: 0.07, ease: 'power2.out' }, { rotationX: 0, duration: 0.09, ease: 'power2.in' }], immediateRender: false }, at + T.toppleFall);
      });
      tl.fromTo('#etable', { rotationX: 62, y: 0 }, { rotationX: 24, y: 40, duration: 0.9, ease: 'power2.inOut', immediateRender: false }, T.toppleDone - 0.1);
      tl.fromTo('.tile3 .up', { boxShadow: '0 0 0 rgba(240,212,138,0)' }, { boxShadow: '0 0 34px rgba(240,212,138,.55)', duration: 0.4, ease: 'power2.out', stagger: 0.03 }, T.toppleDone + 0.05);
      tl.fromTo('#endcard .rogue', { opacity: 0, scale: 1.18 }, { opacity: 1, scale: 1, duration: 0.7, ease: 'expo.out' }, T.toppleDone + 0.45);
      tl.fromTo('#endcard .btn', { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.45, ease: 'back.out(1.8)' }, SC.end.s + 3.6);
      tl.fromTo('#endcard .btn .sheen', { x: -160 }, { x: 1000, duration: 0.9, ease: 'power2.inOut' }, SC.end.s + 4.3);
      tl.fromTo('#endcard .btn .sheen', { x: -160 }, { x: 1000, duration: 0.9, ease: 'power2.inOut', immediateRender: false }, SC.end.s + 5.9);

      window.__timelines['main'] = tl;
    </script>
  </body>
</html>
`;

writeFileSync(path.join(COMP, 'index.html'), html);
console.log(`index.html: ${SCENES.length} cenas, ${sfx.length} efeitos, ${TOTAL}s`);
