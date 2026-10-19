// Teste de fumaça de ponta a ponta: sobe o Vite, abre o jogo num Chrome/Edge do sistema
// (headless, WebGL por SwiftShader), joga uma fase com o bot e salva screenshots em e2e/shots/.
// Uso: node e2e/smoke.mjs [seed] [depth]
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'e2e', 'shots');
mkdirSync(out, { recursive: true });
const seed = Number(process.argv[2] ?? 42);
const depth = Number(process.argv[3] ?? 0);

const candidates = [
  process.env.BROWSER,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
].filter(Boolean);
const executablePath = candidates.find((p) => existsSync(p));

const server = await createServer({ root, server: { port: 5179, strictPort: false }, logLevel: 'error' });
await server.listen();
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({ executablePath, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const shot = (n) => page.screenshot({ path: path.join(out, `${n}.png`) });
const wait = (ms) => page.waitForTimeout(ms);

try {
  await page.goto(url);
  await page.waitForFunction(() => window.__dominotion, null, { timeout: 60000 });
  await wait(2500);
  await shot('01-menu');
  await wait(4000);
  await shot('02-menu-demo');
  await page.evaluate(([s, d]) => { const t = window.__dominotion; t.newRun(s); if (d > 0) { t.game.run.depth = d; t.game.run.deck.common += 40; t.game.run.deck.fork += 3; t.game.run.deck.heavy += 3; t.game.run.deck.blast += 2; t.game.run.deck.tower += 2; t.game.startPhase(); } }, [seed, depth]);
  await wait(1200);
  await shot('03-planning');
  const plan = await page.evaluate(() => window.__dominotion.autoPlan());
  console.log('plan', plan);
  await wait(600);
  await shot('04-planned');
  await page.keyboard.press('Space');
  await page.evaluate(() => { window.__dominotion.game.speed = 3; });
  await wait(1800);
  await shot('05-sim-a');
  await wait(1500);
  await shot('06-sim-b');
  // 240 s: com renderização por software (sem GPU) a física anda bem mais devagar que o relógio
  await page.waitForFunction(() => ['result', 'screen'].includes(window.__dominotion.state().mode), null, { timeout: 240000 });
  await wait(1800);
  await shot('07-result');
  console.log('state', await page.evaluate(() => window.__dominotion.state()));
  const btn = page.locator('.screen .btns button').first();
  await btn.click();
  await wait(1200);
  await shot('08-after');
} catch (e) {
  console.error('FALHOU:', e);
  console.log('debug', await page.evaluate(() => { const g = window.__dominotion.game; const s = g.sim; return { mode: g.mode, fps: 0, t: s?.t, done: s?.done, alive: s?.alive, quiet: s?.quietFor, mv: s && Math.max(...s.pieces.filter(p=>!p.body.isSleeping()).map(p=>{const v=p.body.linvel();return Math.hypot(v.x,v.y,v.z)}), 0), awakeE: s?.enemies.filter(e=>!e.body.isSleeping()).map(e=>({k:e.spec.kind, alive:e.alive, y:e.body.translation().y, v:e.body.linvel()})) }; }));
  await shot('99-error');
  process.exitCode = 1;
} finally {
  if (errors.length) { console.log('ERROS NO CONSOLE:\n' + errors.join('\n')); process.exitCode = 1; }
  await browser.close();
  await server.close();
}
