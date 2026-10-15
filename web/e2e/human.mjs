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
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  for (let i = 1; i <= 40; i++) await page.mouse.move(a.x + (b.x - a.x) * i / 40, a.y + (b.y - a.y) * i / 40);
  await page.mouse.up();
  let n = await page.evaluate(() => window.__topple.game.layout.pieces.length);
  assert(n >= 8, `arrasto colocou ${n} peças`);
  await page.screenshot({ path: path.join(out, 'h1-drawn.png') });
  // botão direito numa ponta remove 1
  const head = await page.evaluate(() => { const h = window.__topple.game.layout.heads()[0]; return [h.x, h.z]; });
  const hs = await toScreen(head[0], head[1]);
  await page.mouse.click(hs.x, hs.y, { button: 'right' });
  const n2 = await page.evaluate(() => window.__topple.game.layout.pieces.length);
  assert(n2 === n - 1, `botão direito removeu a ponta (${n} → ${n2})`);
  // Ctrl+Z desfaz o traço inteiro; desenha de novo
  await page.keyboard.press('Control+z');
  const n3 = await page.evaluate(() => window.__topple.game.layout.pieces.length);
  assert(n3 === 0, `Ctrl+Z desfez o traço (${n3})`);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  for (let i = 1; i <= 40; i++) await page.mouse.move(a.x + (b.x - a.x) * i / 40, a.y + (b.y - a.y) * i / 40);
  await page.mouse.up();
  // estende da ponta até encostar
  const h2 = await page.evaluate(() => { const h = window.__topple.game.layout.heads()[0]; return [h.x, h.z]; });
  const p2 = await toScreen(h2[0], h2[1]);
  const c = await toScreen(ex, ez);
  await page.mouse.move(p2.x, p2.y);
  await page.mouse.down();
  for (let i = 1; i <= 15; i++) await page.mouse.move(p2.x + (c.x - p2.x) * i / 15, p2.y + (c.y - p2.y) * i / 15);
  await page.mouse.up();
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
  await page.locator('.offer').first().click();
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
