// Todas as tomadas do trailer. Cada tomada abre uma página nova (o áudio offline grava uma vez por página).
// node e2e/trailer/takes.mjs nome1 nome2 ...   (sem nomes: lista)
import { openGame, hideHud, record, closeAll } from './lib.mjs';
import { enterRun, loadHero, placeNext, fire, installCursor, installEnglish, installCineCam, cam } from './scene.mjs';

const W = 1920, H = 1080;
const until = (page, fps, pred, after) => {
  let end = -1;
  return async (i) => {
    if (end < 0 && i % 12 === 0 && (await page.evaluate(pred))) end = i + Math.round(after * fps);
    return end > 0 && i >= end;
  };
};
const simDone = () => { const s = window.__dominotion.state(); return s.mode !== 'sim'; };

async function setup({ w = W, h = H, seed = 42, hud = true, audioSeconds = 40 } = {}) {
  const { browser, page } = await openGame({ w, h, audioSeconds });
  await enterRun(page, seed);
  await installCursor(page);
  await installEnglish(page);
  await hideHud(page, hud);
  return { browser, page };
}

/** montagem relâmpago + disparo da corrente herói; `camFn(page)` ajusta câmera antes; `cine` = câmera de cinema na queda */
async function heroTake(name, { w = W, h = H, fps = 120, build, cine, pace = 30 } = {}) {
  const { browser, page } = await setup({ w, h });
  console.log(await loadHero(page));
  if (build) await cam(page, { ...build, snap: true });
  if (cine) await installCineCam(page, cine);
  await page.evaluate(() => window.__cursorTo(-6.9, 0));
  await page.waitForTimeout(1500);
  const F = (s) => Math.round(s * fps);
  let fireAt = -1;
  const done = until(page, fps, simDone, 2.5);
  await record(page, name, {
    seconds: 32, fps,
    onFrame: async (i) => {
      if (i >= F(0.6) && fireAt < 0 && (i - F(0.6)) % Math.max(1, Math.round(fps / pace)) === 0) {
        if ((await placeNext(page, 1)) === 0) fireAt = i + F(0.7);
      }
      if (i === fireAt) await fire(page);
      if (fireAt > 0 && i > fireAt + 30 && (await done(i))) return 'stop';
    },
  });
  await closeAll(browser);
}

const TAKES = {
  // 16:9 — câmera aberta (montagem + queda inteira) e de cinema (persegue a onda)
  'hero-wide': () => heroTake('hero-wide', { cine: { hold: true } }),
  // câmera do próprio jogo (persegue a onda, câmera lenta no último inimigo, abre no fim)
  'hero-game': () => heroTake('hero-game'),
  // de frente para o General e a guarda, baixa e parada: os rostos antes da explosão
  'hero-front': () => heroTake('hero-front', { build: { x: 5.9, z: 0.15, dist: 4.6, az: -Math.PI / 2 - 0.35, pol: 1.12 }, cine: { dist: 4.6, pol: 1.12, az: -Math.PI / 2 - 0.35, azSpeed: 0.012, win: 0.4, ease: 0.0001, x0: 5.9, z0: 0.15 } }),
  'hero-cine': () => heroTake('hero-cine', { cine: { dist: 8, pol: 0.68, az: -0.35, azSpeed: 0.04 } }),
  // chefe: câmera baixa parada perto do General (para o 2º grande momento em câmera lenta)
  'hero-boss': () => heroTake('hero-boss', { cine: { dist: 6.5, pol: 0.62, az: -0.9, azSpeed: 0, win: 0.4, ease: 1.2, x0: 4.5, z0: 0 } }),
  // 9:16 — mesa girada (gatilho embaixo, corrente subindo a tela)
  'hero-vert': () => heroTake('hero-vert', { w: 1080, h: 1920, build: { x: 0.2, z: 0, dist: 19, az: -Math.PI / 2, pol: 0.62 } }),
  'hero-vert-cine': () => heroTake('hero-vert-cine', { w: 1080, h: 1920, build: { x: 0.2, z: 0, dist: 19, az: -Math.PI / 2, pol: 0.62 }, cine: { dist: 9, pol: 0.62, az: -Math.PI / 2, azSpeed: 0.03 } }),

  // jogador de verdade: traça com o mouse (trilha fantasma), pega mão nova, aperta FIRE
  async draw() {
    const { browser, page } = await setup({ hud: 'hand' });
    await page.evaluate(() => window.__cursorMouse(true));
    const toScreen = (x, z) => page.evaluate(([x, z]) => {
      const g = window.__dominotion.game;
      const v = new (g.world.camera.position.constructor)(x, 0, z).project(g.world.camera);
      return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight };
    }, [x, z]);
    const spec = await page.evaluate(() => { const s = window.__dominotion.game.spec; return { t: s.trigger, e: s.enemies.map((e) => [e.x, e.z]) }; });
    const ex = spec.e.reduce((a, b) => a + b[0], 0) / spec.e.length, ez = spec.e.reduce((a, b) => a + b[1], 0) / spec.e.length;
    await cam(page, { x: (spec.t.x + ex) / 2, z: spec.t.z + 0.3, dist: 9.5, pol: 0.8, snap: true });
    await page.waitForTimeout(800);
    // roteiro de mouse por quadro (60 fps)
    const fps = 60, steps = [];
    const A = await toScreen(spec.t.x, spec.t.z);
    const mid = await toScreen(spec.t.x + 2.3, spec.t.z - 0.5);
    const tgt = await toScreen(ex - 0.15, ez);
    const glide = (a, b, n) => { for (let k = 1; k <= n; k++) { const u = k / n, e = u * u * (3 - 2 * u); steps.push({ move: { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e } }); } };
    const hold = (n) => { for (let k = 0; k < n; k++) steps.push({}); };
    const off = { x: A.x - 160, y: A.y + 120 };
    steps.push({ move: off }); hold(20); glide(off, A, 24); hold(8); steps.push({ click: A }); glide(A, mid, 40); hold(6); steps.push({ click: mid }); hold(30);
    steps.push({ key: 'n' }); hold(50);
    steps.push({ headClick: true }); glide(mid, tgt, 40); hold(6); steps.push({ click: tgt }); hold(40);
    steps.push({ fire: true });
    let endI = -1;
    await record(page, 'draw', {
      seconds: 16, fps,
      onFrame: async (i) => {
        const s = steps[i];
        if (s?.move) await page.mouse.move(s.move.x, s.move.y);
        if (s?.click) await page.mouse.click(s.click.x, s.click.y);
        if (s?.key) await page.keyboard.press(s.key);
        if (s?.headClick) {
          const h = await page.evaluate(() => { const g = window.__dominotion.game; const hs = g.layout.heads(); const h = hs[hs.length - 1]; return h && [h.x, h.z]; });
          if (h) { const p = await toScreen(h[0], h[1]); await page.mouse.move(p.x, p.y); await page.mouse.click(p.x, p.y); }
        }
        if (s?.fire) {
          const b = await page.evaluate(() => { const r = document.querySelector('#ui .fire').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
          await page.mouse.move(b.x, b.y); await page.mouse.click(b.x, b.y);
        }
        if (i > steps.length + 30 && endI < 0 && i % 10 === 0 && (await page.evaluate(simDone))) endI = i + 90;
        if (endI > 0 && i >= endI) return 'stop';
      },
    });
    await closeAll(browser);
  },

  // Foguete quicando no muro e atropelando a fila
  async runner() {
    const { browser, page } = await setup({});
    await page.evaluate(async () => {
      const R = await import('/e2e/trailer/runner.ts');
      const D = await import('/e2e/trailer/director.ts');
      const { Layout } = await import('/src/core/layout.ts');
      const g = window.__dominotion.game;
      const spec = R.runnerSpec();
      const { layout } = D.direct(spec, R.RUNNER_CMDS);
      g.spec = spec; g.board.build(spec); g.layout = new Layout(spec, D.heroDeck()); g.decals.clear(); g.mode = 'planning';
      for (const p of layout.pieces) { g.layout.pieces.push(p); g.board.addPiece(p, false); }
    });
    await cam(page, { x: -1.2, z: 0.0, dist: 6.2, az: 0.25, pol: 0.72, snap: true });
    await installCineCam(page, { dist: 6.2, pol: 0.72, az: 0.25, azSpeed: -0.03, win: 0.35, ease: 1.6, x0: -1.6, z0: 0.2 });
    await page.waitForTimeout(1200);
    const fps = 120;
    const done = until(page, fps, simDone, 1.5);
    await record(page, 'runner', { seconds: 10, fps, onFrame: async (i) => { if (i === 36) await fire(page); if (i > 60) return (await done(i)) ? 'stop' : undefined; } });
    await closeAll(browser);
  },

  // inimigos especiais (arqueiro, ogro, general) numa fase gerada de verdade, plano do bot
  async enemies() {
    const { browser, page } = await setup({});
    const { loadPhase } = await import('./scene.mjs');
    console.log(await loadPhase(page, { seed: Number(process.env.ESEED ?? 1074), depth: Number(process.env.EDEPTH ?? 14), deck: { common: 140, fork: 5, heavy: 6, blast: 4, tower: 4 } }));
    await page.evaluate(() => { const g = window.__dominotion.game; for (const p of window.__plan) { g.layout.pieces.push(p); g.board.addPiece(p, false); } });
    await installCineCam(page, { dist: 7.5, pol: 0.66, az: 0.3, azSpeed: -0.03 });
    await page.waitForTimeout(1500);
    const fps = 120;
    const done = until(page, fps, simDone, 1.5);
    await record(page, 'enemies', { seconds: 24, fps, onFrame: async (i) => { if (i === 30) await fire(page); if (i > 60) return (await done(i)) ? 'stop' : undefined; } });
    await closeAll(browser);
  },

  // a mão do dono da mesa varre a corrente derrubada
  async sweep() {
    const { browser, page } = await setup({});
    console.log(await loadHero(page));
    await placeNext(page, 999);
    await page.waitForTimeout(800);
    await fire(page);
    await page.waitForFunction(simDone, null, { timeout: 60000 });
    await page.waitForTimeout(1500);
    await page.evaluate(() => { window.__dominotion.game.ui.closeScreen?.(); });
    await hideHud(page, true);
    const fps = 60;
    await record(page, 'sweep', { seconds: 9, fps, onFrame: async (i) => { if (i === 20) await page.evaluate(() => window.__dominotion.transition()); } });
    await closeAll(browser);
  },

  // eventos entre fases (sem textos): loja, prensa de selos, altar
  ...Object.fromEntries(['shop', 'press', 'mystic', 'curse'].map((k) => [k, async () => {
    const { browser, page } = await setup({});
    await page.evaluate((k) => window.__dominotion.openEvent(k), k);
    await page.waitForTimeout(6000);
    await hideHud(page, true);
    const r = await page.evaluate(() => { const r = window.__dominotion.game.rig; return { az: r.goalAz, d: r.goalDist, pol: r.goalPol, x: r.goalTarget.x, z: r.goalTarget.z }; });
    const fps = 60, n = 7 * fps;
    await record(page, 'ev-' + k, {
      seconds: 7, fps,
      onFrame: async (i) => { const u = i / n; await cam(page, { x: r.x, z: r.z, dist: r.d * (1.02 - 0.12 * u), az: r.az - 0.25 + 0.5 * u, pol: r.pol - 0.06 }); },
    });
    await closeAll(browser);
  }])),

  // trilha: só a música generativa do jogo (efeitos mudos), 120 BPM fixo, com um arco de intensidade
  // ARC = [[t, perc, tension, boss], ...]
  async music() {
    const name = process.env.MNAME ?? 'music';
    const secs = Number(process.env.MSECS ?? 50);
    const arc = JSON.parse(process.env.ARC ?? '[[0,0,0.3,0],[4,1,0.8,0],[12,0,0.4,0],[15,0.6,0.6,0],[30,0.3,0.7,0],[38,1,1,0],[44,0,0.3,0]]');
    const { browser, page } = await openGame({ w: 320, h: 180, audioSeconds: secs + 5 });
    await page.evaluate(() => { const a = window.__audio; a.setMusic(true, 1); a.setBoss(false); a.setHeartbeat(false); });
    const fps = 30;
    await record(page, name, {
      seconds: secs, fps, jpeg: true,
      onFrame: async (i, t) => {
        await page.evaluate(([t, arc, fps]) => {
          const a = window.__audio;
          a.sfx.gain.value = 0;
          a.setMusic(true, 1);
          let cur = arc[0];
          for (const k of arc) if (k[0] <= t) cur = k;
          a.setPerc = () => {}; a.perc = cur[1]; if (Math.abs((a.__lt ?? -1) - cur[2]) > 0.001) { a.setTension(cur[2]); a.__lt = cur[2]; }
          a.setBoss(!!cur[3]);
        }, [t, arc, fps]);
      },
    });
    await closeAll(browser);
  },

  // tela final: logo do jogo (o do menu) + chamada
  async endcard() {
    const { browser, page } = await openGame({ w: Number(process.env.EW ?? W), h: Number(process.env.EH ?? H), audioSeconds: 20 });
    await page.waitForTimeout(2500);
    await page.evaluate(() => {
      const s = document.createElement('style');
      s.textContent = `#ui .menu > *:not(.logo) { opacity: 0 !important; } #ui .menu-foot { opacity: 0 !important; }
        #cta { position: fixed; left: 0; right: 0; text-align: center; font-family: var(--display); color: #f3ead8; letter-spacing: 3px;
          text-shadow: 0 3px 0 #3a0808, 0 0 24px rgba(0,0,0,.9); pointer-events: none; z-index: 999; }`;
      document.head.appendChild(s);
      const logo = document.querySelector('#ui .logo');
      const r = logo.getBoundingClientRect();
      const c = document.createElement('div'); c.id = 'cta';
      c.style.top = r.bottom + 40 + 'px';
      c.style.fontSize = Math.round(Math.min(innerWidth, innerHeight * 1.2) * 0.04) + 'px';
      c.innerHTML = 'A DOMINO ROGUELIKE<br><span style="display:inline-block;margin-top:.9em;padding:.35em 1.1em;border:2px solid #c9a24a;border-radius:10px;background:rgba(20,8,8,.75);color:#ffd77a;font-size:1.15em">WISHLIST NOW ON STEAM</span>';
      document.body.appendChild(c);
    });
    await record(page, 'endcard' + (process.env.EW ? '-' + process.env.EW : ''), { seconds: 6, fps: 60 });
    await closeAll(browser);
  },
};

const names = process.argv.slice(2);
if (!names.length) console.log(Object.keys(TAKES).join('\n'));
for (const n of names) {
  console.log('== ' + n);
  const t0 = Date.now();
  try { await TAKES[n](); } catch (e) { console.error('FALHOU', n, e); }
  console.log(`== ${n} ok (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
}
process.exit(0);
