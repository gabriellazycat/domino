// Helpers de cena rodando dentro da página do jogo.

/** Menu → run nova, em modo de planejamento. */
export async function enterRun(page, seed = 42) {
  await page.evaluate(() => [...document.querySelectorAll('button')].find((b) => /Jogar/.test(b.textContent))?.click());
  await page.waitForFunction(() => window.__topple.state().mode === 'planning', null, { timeout: 30000 });
  await page.evaluate((s) => window.__topple.newRun(s), seed);
  await page.waitForTimeout(2500);
}

/**
 * Troca a fase atual por uma gerada (seed/depth/deck), resolve com o bot e deixa a mesa VAZIA,
 * guardando a solução em window.__plan para a montagem acelerada.
 */
export async function loadPhase(page, { seed, depth, deck, strip = false, mutate = null }) {
  return page.evaluate(async ({ seed, depth, deck, strip, mutate }) => {
    const { generatePhase } = await import('/src/core/mapgen.ts');
    const { solve } = await import('/src/game/solver.ts');
    const { Layout } = await import('/src/core/layout.ts');
    const { emptyDeck } = await import('/src/core/pieces.ts');
    const g = window.__topple.game;
    const d = Object.assign(emptyDeck(), deck);
    const spec = generatePhase(seed, depth, d);
    if (strip) spec.enemies = spec.enemies.filter((e) => !e.patrol && e.kind !== 'archer');
    if (mutate) (0, eval)(mutate)(spec);
    const r = solve(spec, d);
    g.disposeSim?.();
    g.spec = spec;
    g.board.build(spec);
    g.layout = new Layout(spec, d);
    g.decals.clear();
    g.mode = 'planning';
    g.frameBoard();
    g.rig.snap();
    g.refreshHud?.();
    window.__plan = r.layout.pieces.map((p) => ({ ...p }));
    return { win: r.win, alive: r.alive, pieces: r.layout.pieces.length, enemies: spec.enemies.length };
  }, { seed, depth, deck, strip, mutate: mutate ? mutate.toString() : null });
}

/** Põe as próximas `k` peças da solução na mesa (animação de colocar + som), move o cursor fake até a última. */
export async function placeNext(page, k = 1) {
  return page.evaluate((k) => {
    const g = window.__topple.game;
    const plan = window.__plan;
    let last = null;
    for (let j = 0; j < k && plan.length; j++) {
      const p = plan.shift();
      g.layout.pieces.push(p);
      g.board.addPiece(p, true);
      window.__audio.place(g.layout.pieces.length);
      last = p;
    }
    if (last) window.__cursorTo?.(last.x, last.z);
    return plan.length;
  }, k);
}

export async function fire(page) {
  await page.evaluate(() => { window.__cursorHide?.(); window.__topple.game.fire(); });
}

/** Cursor de mouse desenhado (o headless não mostra o do sistema). Segue pontos do mundo. */
export async function installCursor(page) {
  await page.evaluate(() => {
    const el = document.createElement('div');
    el.id = 'cap-cursor';
    el.innerHTML = '<svg width="54" height="54" viewBox="0 0 24 24"><path d="M3 2 L3 19 L8 14.5 L11.5 22 L14.5 20.6 L11 13.4 L17.5 13.4 Z" fill="#f6efe0" stroke="#1a1410" stroke-width="1.4" stroke-linejoin="round"/></svg>';
    Object.assign(el.style, { position: 'fixed', left: '0', top: '0', zIndex: 99999, pointerEvents: 'none', filter: 'drop-shadow(2px 3px 2px rgba(0,0,0,.55))', transition: 'none', display: 'none' });
    document.body.appendChild(el);
    let tx = 0, tz = 0, sx = null, sy = null, on = false;
    const proj = (x, z) => {
      const cam = window.__topple.game.world.camera;
      const v = new cam.position.constructor(x, 0.1, z).project(cam);
      return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight];
    };
    window.__cursorTo = (x, z) => { tx = x; tz = z; on = true; el.style.display = 'block'; };
    window.__cursorHide = () => { on = false; el.style.display = 'none'; };
    // modo mouse: segue o ponteiro de verdade (page.mouse)
    let mouse = false, mx = 0, my = 0;
    window.__cursorMouse = (v = true) => { mouse = v; on = false; el.style.display = v ? 'block' : 'none'; };
    window.addEventListener('pointermove', (e) => { mx = e.clientX; my = e.clientY; if (mouse) el.style.transform = `translate(${mx - 4}px, ${my - 3}px)`; }, true);
    const loop = () => {
      if (on) {
        const [x, y] = proj(tx, tz);
        if (sx === null) { sx = x; sy = y; }
        sx += (x - sx) * 0.45; sy += (y - sy) * 0.45;
        el.style.transform = `translate(${sx - 4}px, ${sy - 3}px)`;
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
}

/** Fase herói (diretor): mesa vazia + solução guardada em window.__plan. */
export async function loadHero(page) {
  return page.evaluate(async () => {
    const D = await import('/e2e/trailer/director.ts');
    const { Layout } = await import('/src/core/layout.ts');
    const g = window.__topple.game;
    const spec = D.heroSpec();
    const { layout, fails } = D.direct(spec);
    g.disposeSim?.();
    g.spec = spec;
    g.board.build(spec);
    g.layout = new Layout(spec, D.heroDeck());
    g.decals.clear();
    g.mode = 'planning';
    g.frameBoard();
    g.rig.snap();
    window.__plan = layout.pieces.map((p) => ({ ...p }));
    return { pieces: layout.pieces.length, fails };
  });
}

/** Trailer em inglês: traduz só os textos que saltam na mesa (o jogo continua em português). */
export async function installEnglish(page) {
  await page.evaluate(() => {
    const fx = window.__topple.game.fx;
    const EN = {
      'KABUM!': 'KABOOM!', 'VOOU!': 'YEET!', 'DOMINÓ!': 'DOMINO!', 'TUM!': 'THUD!', 'EMPURRÃO!': 'SHOVE!', 'QUEIMOU!': 'BURNED!',
      'FLECHADA!': 'ARROW!', 'ESMAGOU!': 'CRUSH!', 'BUUUM!': 'BOOOM!', 'CLIC!': 'CLICK!',
      'PLOFT!': 'PLOP!', 'TOMBO!': 'TOPPLE!', 'ZÁS!': 'WHAM!',
    };
    const orig = fx.text.bind(fx);
    fx.text = (x, y, z, txt, ...rest) => {
      let t = EN[txt] ?? txt;
      t = t.replace(/^ABRIU!/, 'OPEN!');
      if (/[ÃÕÇÁÉÍÓÚ]/.test(t) && !EN[txt]) console.log('[pt]', txt);
      return orig(x, y, z, t, ...rest);
    };
    const ui = window.__topple.game.ui;
    if (ui?.combo) { const oc = ui.combo.bind(ui); ui.combo = (...a) => oc(...a); }
  });
}

/**
 * Câmera de cinema na simulação: persegue a frente da onda (média das últimas quedas), mais perto e
 * mais deitada que a câmera do jogo. cfg: { dist, pol, az, azSpeed, win: janela de quedas (s), ease }.
 */
export async function installCineCam(page, cfg = {}) {
  await page.evaluate((cfg) => {
    const g = window.__topple.game;
    window.__cine = Object.assign({ dist: 8.5, pol: 0.72, az: 0, azSpeed: 0, win: 0.5, ease: 2.2, on: true }, cfg);
    let sx = cfg.x0 ?? g.spec.trigger.x, sz = cfg.z0 ?? g.spec.trigger.z, lastT = performance.now();
    const orig = g.followCascade.bind(g);
    g.followCascade = function () {
      const c = window.__cine;
      if (!c.on) return orig();
      if (c.hold) return; // câmera parada no enquadramento da fase (tomada aberta)
      const now = performance.now();
      const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
      const sim = this.sim;
      const recent = sim.recentFalls.filter((f) => sim.t - f.t < c.win);
      if (recent.length) {
        let x = 0, z = 0;
        for (const f of recent) { x += f.x; z += f.z; }
        x /= recent.length; z /= recent.length;
        if (sx === null) { sx = x; sz = z; }
        const k = 1 - Math.exp(-dt * c.ease);
        sx += (x - sx) * k; sz += (z - sz) * k;
      }
      if (sx !== null) this.rig.goalTarget.set(sx, 0, sz);
      this.rig.goalDist = c.dist; this.rig.goalPol = c.pol;
      this.rig.goalAz = c.az + c.azSpeed * sim.t;
    };
  }, cfg);
}

/** Câmera manual (planejamento/montagem). */
export async function cam(page, { x = 0, z = 0.5, dist = 15, az = 0, pol = 0.86, snap = false }) {
  await page.evaluate(({ x, z, dist, az, pol, snap }) => {
    const r = window.__topple.game.rig;
    r.goalTarget.set(x, 0, z); r.goalDist = dist; r.goalAz = az; r.goalPol = pol;
    if (snap) r.snap();
  }, { x, z, dist, az, pol, snap });
}
