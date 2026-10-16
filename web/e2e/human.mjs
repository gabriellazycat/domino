// Joga a fase 1 só com mouse/teclado (como um humano): arrasta do gatilho até os soldados,
// testa botão direito (remove ponta), Ctrl+Z, dispara e confere vitória + tela de recompensa.
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'e2e', 'shots');
mkdirSync(out, { recursive: true });
const executablePath = [process.env.BROWSER, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean).find((p) => existsSync(p));
const server = await createServer({ root, server: { port: 5180 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ executablePath, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
const assert = (c, msg) => { if (!c) throw new Error('ASSERT: ' + msg); console.log('ok -', msg); };
// começa a trilha clicando em `a` e leva o mouse até `b` (só fantasma, nada colocado ainda)
const trace = async (a, b, steps) => {
  await page.mouse.move(a.x, a.y);
  await page.mouse.click(a.x, a.y);
  for (let i = 1; i <= steps; i++) await page.mouse.move(a.x + (b.x - a.x) * i / steps, a.y + (b.y - a.y) * i / steps);
};
const toScreen = (x, z) => page.evaluate(([x, z]) => {
  const g = window.__topple.game;
  const v = new (g.world.camera.position.constructor)(x, 0, z).project(g.world.camera);
  return { x: (v.x + 1) / 2 * innerWidth, y: (1 - v.y) / 2 * innerHeight };
}, [x, z]);

try {
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForFunction(() => window.__topple, null, { timeout: 60000 });
  await page.waitForTimeout(1500);
  // menu → Jogar (clique de verdade no botão)
  await page.getByRole('button', { name: /Jogar/ }).click();
  await page.waitForFunction(() => window.__topple.state().mode === 'planning');
  await page.evaluate(() => window.__topple.newRun(42));
  await page.waitForTimeout(1500); // câmera assenta
  const spec = await page.evaluate(() => { const s = window.__topple.game.spec; return { t: s.trigger, e: s.enemies.map((e) => [e.x, e.z]) }; });
  const ex = spec.e.reduce((a, b) => a + b[0], 0) / spec.e.length, ez = spec.e.reduce((a, b) => a + b[1], 0) / spec.e.length;
  const a = await toScreen(spec.t.x, spec.t.z);
  const b = await toScreen(ex - 0.5, ez);
  await trace(a, b, 40);
  assert((await page.evaluate(() => window.__topple.game.layout.pieces.length)) === 0, 'mover o mouse não coloca peças (só fantasma)');
  const use = await page.evaluate(() => document.querySelectorAll('.hc.use').length);
  assert(use > 0, `a trilha fantasma levanta as cartas que vai gastar (${use})`);
  // trilha curta (a mão continua com cartas, nada é travado ainda)
  const near = await toScreen(spec.t.x + 1.3, spec.t.z);
  await page.mouse.click(near.x, near.y);
  let n = await page.evaluate(() => window.__topple.game.layout.pieces.length);
  assert(n >= 2 && n <= 7, `clique no chão colocou ${n} peças`);
  const hand = await page.evaluate(() => window.__topple.game.layout.handCount());
  assert(hand === 7 - n, `cada peça gastou uma carta da mão (sobraram ${hand})`);
  await page.screenshot({ path: path.join(out, 'h1-drawn.png') });
  // botão direito numa ponta remove 1 (e a carta volta)
  const head = await page.evaluate(() => { const h = window.__topple.game.layout.heads()[0]; return [h.x, h.z]; });
  const hs = await toScreen(head[0], head[1]);
  await page.mouse.click(hs.x, hs.y, { button: 'right' });
  const n2 = await page.evaluate(() => window.__topple.game.layout.pieces.length);
  assert(n2 === n - 1, `botão direito removeu a ponta (${n} → ${n2})`);
  // Ctrl+Z desfaz o traço inteiro
  await page.keyboard.press('Control+z');
  const n3 = await page.evaluate(() => window.__topple.game.layout.pieces.length);
  assert(n3 === 0, `Ctrl+Z desfez o traço (${n3})`);
  // monta a corrente por partes, mão a mão, até encostar nos soldados
  const c = await toScreen(ex, ez);
  await trace(a, c, 30);
  await page.mouse.click(c.x, c.y);
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(900);
    const st = await page.evaluate(() => { const g = window.__topple.game; const h = g.layout.heads()[0]; return { h: [h.x, h.z], hand: g.layout.handCount(), pile: g.layout.pile.size }; });
    if (Math.hypot(st.h[0] - ex, st.h[1] - ez) < 1.0 || (st.hand === 0 && st.pile === 0)) break;
    if (st.hand === 0) { await page.keyboard.press('d'); continue; }
    const p2 = await toScreen(st.h[0], st.h[1]);
    await trace(p2, c, 15);
    await page.mouse.click(c.x, c.y);
  }
  n = await page.evaluate(() => window.__topple.game.layout.pieces.length);
  console.log('peças:', n);
  await page.screenshot({ path: path.join(out, 'h2-ready.png') });
  await page.keyboard.press('Space');
  await page.evaluate(() => { window.__topple.game.speed = 3; });
  await page.waitForFunction(() => window.__topple.state().mode === 'result', null, { timeout: 90000 });
  const st = await page.evaluate(() => window.__topple.state());
  assert(st.win === true, 'venceu a fase 1 desenhando com o mouse');
  await page.waitForTimeout(1500);
  await page.getByRole('button', { name: /recompensa/i }).click();
  await page.waitForSelector('.offer');
  // as cartas balançam sem parar (animação idle) e nunca ficam "estáveis" para o Playwright:
  // espera a animação de entrada e clica no centro da carta com o mouse, como uma pessoa
  await page.waitForTimeout(900);
  const card = await page.locator('.offer').first().boundingBox();
  await page.mouse.click(card.x + card.width / 2, card.y + card.height / 2);
  await page.waitForFunction(() => window.__topple.state().mode === 'planning' && window.__topple.state().depth === 1, null, { timeout: 10000 });
  assert(true, 'escolheu recompensa e foi para a fase 2');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(out, 'h3-phase2.png') });
} catch (e) {
  console.error('FALHOU:', e.message);
  await page.screenshot({ path: path.join(out, 'h99-error.png') });
  process.exitCode = 1;
} finally {
  if (errors.length) { console.log('ERROS:\n' + errors.join('\n')); process.exitCode = 1; }
  await browser.close();
  await server.close();
}
