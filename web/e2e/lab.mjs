// Fotos do laboratório visual (variações da Loja, câmera): usa o dev server que já está rodando.
// Uso: node e2e/lab.mjs shop [A B C]   →  e2e/shots/lab-*.png      (URL=http://localhost:5173 por padrão)
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'e2e', 'shots');
mkdirSync(out, { recursive: true });
const executablePath = [process.env.BROWSER, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].filter(Boolean).find((p) => existsSync(p));
const url = process.env.URL ?? 'http://localhost:5173/';
const [what = 'shop', ...args] = process.argv.slice(2);

const browser = await chromium.launch({ executablePath, headless: true, args: ['--headless=new', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const wait = (ms) => page.waitForTimeout(ms);
const shot = (n) => page.screenshot({ path: path.join(out, `lab-${n}.png`) });

await page.goto(url);
await page.waitForFunction(() => !!window.__dominotion, null, { timeout: 30000 });
await wait(1200);

if (what === 'shop') {
  const styles = args.length ? args : ['atual'];
  await page.evaluate(() => { const t = window.__dominotion; t.newRun(7); });
  await wait(2600);
  for (const st of styles) {
    await page.evaluate((st) => {
      const t = window.__dominotion; t.game.run.gold = 60; t.game.run.life = 6;
      if (st !== 'atual') localStorage.setItem('lab.shop', st); else localStorage.removeItem('lab.shop');
      t.openEvent('shop');
    }, st);
    await wait(7500);
    await shot(`shop-${st}`);
    // de perto, do ângulo do jogador olhando os serviços
    await page.evaluate(() => { const r = window.__dominotion.game.rig; r.frame(r.goalTarget.clone().setZ(1.4), 7.5, 0.25, 1.05); });
    await wait(1600);
    await shot(`shop-${st}-perto`);
    await page.evaluate(() => { const g = window.__dominotion.game; g.event?.leave(); });
    await wait(5200);
  }
}

if (what === 'menu') {
  // a demo do menu é calculada no worker: a mesa tem de aparecer e trocar sem quadro longo
  await page.waitForFunction(() => window.__dominotion.game.demo?.shown, null, { timeout: 60000 });
  const r = await page.evaluate(async () => {
    const g = window.__dominotion.game;
    let worst = 0, last = performance.now(), swaps = 0, seed = g.demo.seed, run = true, swapAt = last;
    const long = [];
    // cronometra as partes do quadro do jogo para saber de onde vem um quadro longo
    const parts = {};
    const time = (obj, name, key) => { const o = obj[name]; obj[name] = function (...a) { const t = performance.now(); const r = o.apply(this, a); parts[key] = Math.max(parts[key] ?? 0, performance.now() - t); return r; }; };
    time(g, 'buildDemo', 'buildDemo'); time(g, 'makeSim', 'makeSim'); time(g.world, 'render', 'render'); time(g.board, 'syncSim', 'syncSim'); time(g.fx, 'update', 'fx'); time(g, 'update', 'update');
    (function f() {
      const n = performance.now(), d = n - last; last = n;
      if (g.demo && g.demo.seed !== seed) { seed = g.demo.seed; swaps++; swapAt = n; }
      if (d > 50) long.push({ ms: Math.round(d), sinceSwap: Math.round(n - swapAt), sim: !!g.sim, parts: Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, Math.round(v)])) });
      for (const k in parts) parts[k] = 0;
      worst = Math.max(worst, d);
      if (run) requestAnimationFrame(f);
    })();
    const t0 = performance.now();
    while (swaps < 2 && performance.now() - t0 < 90000) await new Promise((res) => setTimeout(res, 250));
    await new Promise((res) => setTimeout(res, 3000));
    run = false;
    return { swaps, worstFrameMs: Math.round(worst), worker: !!g.demoWorker, broken: g.demoWorkerBroken, long };
  });
  console.log('menu', JSON.stringify(r));
  await shot('menu');
}

if (what === 'events') {
  await page.evaluate(() => { window.__dominotion.newRun(7); });
  await wait(2600);
  for (const k of ['press', 'mystic', 'curse']) {
    await page.evaluate((k) => { const t = window.__dominotion; t.game.run.gold = 60; t.openEvent(k); }, k);
    // a câmera levanta para o dono na fala de abertura: foto 1,3 s depois de ela começar a subir
    await page.waitForFunction(() => window.__dominotion.game.rig.looking, null, { timeout: 20000 });
    await wait(1300);
    await shot(`ev-${k}-olhar`);
    await wait(4200);
    await shot(`ev-${k}`);
    // sai do evento sem passar pela escolha (o Presente não tem "ir embora")
    await page.evaluate(() => { const g = window.__dominotion.game; g.event.busy = false; g.leaveEvent(); });
    await wait(5200);
  }
}

if (what === 'vilao') {
  // variações do dono da mesa (?vilao=): plano médio, de perto (deboche), falando bravo e de olhos fechados
  const ids = args.length ? args : ['atual'];
  const hideTip = () => page.evaluate(() => {
    for (const e of document.querySelectorAll('body *')) if (e.children.length < 3 && /Your hand is at the bottom|Sua mão/.test(e.textContent ?? '')) (e.closest('[class]') ?? e).style.visibility = 'hidden';
  });
  for (const id of ids) {
    // 'oficial' = jogo sem parâmetro (vilão padrão); 'atual' = cabeça antiga (?vilao=atual)
    // 'traje-<id>' = vilão oficial com aquele traje (?traje=<id>)
    const u = new URL(url);
    if (id.startsWith('traje-')) u.searchParams.set('traje', id.slice(6));
    else if (id !== 'oficial') u.searchParams.set('vilao', id);
    await page.goto(u.toString());
    await page.waitForFunction(() => !!window.__dominotion, null, { timeout: 30000 });
    // a variação carrega/monta em segundo plano: espera a cabeça nova entrar antes de começar a fase
    if (id !== 'atual') await page.waitForFunction(() => !!window.__dominotion.game.world.backdrop.head.getObjectByName('Head'), null, { timeout: 60000 });
    await page.evaluate(() => { window.__dominotion.newRun(7); });
    await wait(9000);
    if (process.env.LAB_EVAL) await page.evaluate(process.env.LAB_EVAL);
    await hideTip();
    // de perto nos soldadinhos (para ver os olhos deles: com ?vilao=T6A/T7* viram vórtice)
    const hasEnemy = await page.evaluate(() => {
      const g = window.__dominotion.game; const v = g.board.enemyViews[0];
      if (!v) return false;
      const p = v.pivot.position.clone(); p.y += 0.35;
      g.rig.lookUp(p, 2.2, 1.25, 4);
      // a câmera trava o azimute nesse olhar: só para o print, os soldadinhos viram o rosto para ela (+Z)
      for (const w of g.board.enemyViews) w.pivot.rotation.y = 0;
      return true;
    });
    if (hasEnemy) { await wait(2600); await shot(`vilao-${id}-inimigos`); }
    await page.evaluate(() => {
      const g = window.__dominotion.game; const T = g.world.backdrop.head.position;
      g.rig.lookUp(T.clone().setY(T.y + 0.2).setZ(T.z + 1.6), 17, 1.2, 6);
    });
    await wait(1900);
    await shot(`vilao-${id}-medio`);
    await page.evaluate(() => { const g = window.__dominotion.game; g.world.backdrop.mood = 'amused'; g.ownerLook(9); });
    await wait(2200);
    await shot(`vilao-${id}-perto`);
    await page.evaluate(() => { const g = window.__dominotion.game; g.world.backdrop.mood = 'angry'; g.world.backdrop.talk(2); });
    await wait(700);
    await shot(`vilao-${id}-bravo`);
    await page.evaluate(() => {
      const b = window.__dominotion.game.world.backdrop; const up = b.update.bind(b);
      b.update = (dt, c) => { up(dt, c); for (const e of b.eyes) e.lid.rotation.x = 0.95; };
    });
    await wait(300);
    await shot(`vilao-${id}-fechado`);
  }
}

if (what === 'giro') {
  // encaixe dos trajes: o boneco de perto girando (frente, 3/4, perfil, trás) → e2e/shots/giro-<id>-<ang>.png
  const ids = args.length ? args : ['oficial'];
  for (const id of ids) {
    const u = new URL(url);
    if (id !== 'oficial') u.searchParams.set('traje', id);
    await page.goto(u.toString());
    await page.waitForFunction(() => !!window.__vilaoRoot, null, { timeout: 60000 });
    await page.evaluate(() => { window.__dominotion.newRun(7); });
    await wait(7000);
    await page.evaluate(() => {
      const g = window.__dominotion.game; g.ownerLook(30);
      for (const e of document.querySelectorAll('body > *:not(canvas)')) if (!e.querySelector('canvas')) e.style.visibility = 'hidden';
    });
    for (const a of [0, 45, 90, 160]) {
      await page.evaluate((a) => { window.__vilaoRoot.rotation.y = (a * Math.PI) / 180; }, a);
      await wait(900);
      await page.screenshot({ path: path.join(out, `giro-${id}-${a}.png`), clip: { x: 500, y: 120, width: 600, height: 600 } });
    }
  }
}

if (what === 'trajes') {
  // fluxo real dos eventos: entra (o dono troca de boneco), foto do dono, sai (varre a mão do traje), volta ao de sempre
  await page.waitForFunction(() => !!window.__vilaoRoot, null, { timeout: 60000 });
  await page.evaluate(() => window.__dominotion.newRun(7));
  await wait(6000);
  const log = [];
  for (const k of args.length ? args : ['shop', 'mystic', 'press', 'curse']) {
    await page.evaluate((k) => { const t = window.__dominotion; t.game.run.gold = 60; t.openEvent(k); }, k);
    await page.waitForFunction(() => window.__dominotion.game.mode === 'event', null, { timeout: 30000 });
    await wait(5000);
    const inEv = await page.evaluate(() => { const bd = window.__dominotion.game.world.backdrop; return { costume: bd.costume, lift: +bd.lift.toFixed(2) }; });
    await page.evaluate(() => { const g = window.__dominotion.game; const T = g.world.backdrop.head.position; g.rig.lookUp(T.clone().setY(T.y + 0.2).setZ(T.z + 1.6), 13, 1.2, 4); });
    await wait(1800);
    await shot(`trajes-${k}-dono`);
    await page.evaluate(() => { const g = window.__dominotion.game; g.event.busy = false; g.leaveEvent(); });
    await page.waitForFunction(() => window.__dominotion.game.hand.landed, null, { timeout: 20000, polling: 30 });
    await wait(200);
    const hand = await page.evaluate(() => window.__dominotion.game.hand.dressed);
    await shot(`trajes-${k}-mao`);
    await page.waitForFunction(() => window.__dominotion.game.mode === 'planning', null, { timeout: 30000 });
    await wait(3000);
    const after = await page.evaluate(() => { const bd = window.__dominotion.game.world.backdrop; return { costume: bd.costume, lift: +bd.lift.toFixed(2), traje: window.__vilaoRoot.children.some((c) => c.name.startsWith('traje-')) }; });
    log.push({ k, inEv, hand, after });
  }
  console.log(JSON.stringify(log));
}

if (what === 'maos') {
  // a mão que varre a mesa vestida de cada traje (luva, manga, joias) no momento em que pousa
  await page.waitForFunction(() => !!window.__vilaoRoot, null, { timeout: 60000 });
  await page.evaluate(() => window.__dominotion.newRun(7));
  await wait(6000);
  for (const id of args.length ? args : ['normal', 'banqueiro', 'vidente', 'coveiro', 'palhaco']) {
    await page.evaluate((id) => { const g = window.__dominotion.game; g.hand.dress(id === 'normal' ? null : id); const s = g.hand.dress.bind(g.hand); g.hand.dress = () => {}; window.__dominotion.transition(); g.hand.dress = s; }, id);
    await page.waitForFunction(() => window.__dominotion.game.hand.landed, null, { timeout: 20000, polling: 30 });
    await wait(250);
    await page.screenshot({ path: path.join(out, `mao-${id}.png`), clip: { x: 0, y: 0, width: 800, height: 520 } });
    await page.waitForFunction(() => window.__dominotion.game.mode !== 'transition', null, { timeout: 30000 });
    await wait(2500);
  }
}

if (what === 'cam') {
  // golpe final: o bot planeja, dispara, e a foto sai nos instantes depois do corte
  for (const seed of [11, 23, 5, 42, 77, 3]) {
    await page.evaluate((seed) => { window.__dominotion.newRun(seed); }, seed);
    await wait(4200);
    const plan = await page.evaluate(async () => {
      // o resolvedor do menu acha um plano vencedor com um baralho farto; as peças entram direto na mesa
      const g = window.__dominotion.game;
      const [{ solve }, { emptyDeck }] = await Promise.all([import('/src/game/solver.ts'), import('/src/core/pieces.ts')]);
      const deck = emptyDeck(); deck.common = 80; deck.fork = 3; deck.heavy = 4; deck.blast = 3;
      const r = solve(g.spec, deck);
      g.layout.pieces = r.layout.pieces;
      g.board.clearPieces();
      for (const p of g.layout.pieces) g.board.addPiece(p, false);
      g.fire();
      return { win: r.win, n: r.layout.pieces.length };
    });
    const hit = await page.waitForFunction(() => { const g = window.__dominotion.game; return !!g.killcam || g.mode === 'result'; }, null, { timeout: 60000 }).then(() => page.evaluate(() => !!window.__dominotion.game.killcam));
    console.log('seed', seed, JSON.stringify(plan), 'golpe final:', hit);
    if (!hit) continue;
    await wait(120); await shot('cam-golpe-1');
    await wait(450); await shot('cam-golpe-2');
    await wait(600); await shot('cam-golpe-3');
    await page.waitForFunction(() => window.__dominotion.game.mode === 'result', null, { timeout: 20000 });
    await wait(1300); await shot('cam-resultado-olhar');
    await wait(3200); await shot('cam-resultado-volta');
    break;
  }
}

console.log(errors.length ? 'ERROS:\n' + errors.join('\n') : 'ok, sem erros');
await browser.close();
