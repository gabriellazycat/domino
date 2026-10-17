// Vitrine das peças e inimigos novos: monta cenas com a API de depuração, fotografa o planejamento
// (trajeto do Foguete, arco da Saltadora, porteira, círculo do Arqueiro, Ogro) e a simulação.
// Uso: GPU=1 node e2e/novidades.mjs   →  e2e/shots/nov-*.png
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'e2e', 'shots');
mkdirSync(out, { recursive: true });
const candidates = [
  process.env.BROWSER,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
].filter(Boolean);
const executablePath = candidates.find((p) => existsSync(p));

const server = await createServer({ root, server: { port: 5181, strictPort: false }, logLevel: 'error' });
await server.listen();
const url = server.resolvedUrls.local[0];
// GPU=1 usa a placa de vídeo (o SwiftShader do headless não desenha o pós-processamento do tabuleiro)
const browser = await chromium.launch({ executablePath, headless: true, args: process.env.GPU ? ['--headless=new', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const shot = (n) => page.screenshot({ path: path.join(out, `nov-${n}.png`) });
const wait = (ms) => page.waitForTimeout(ms);

/** Começa a fase `depth` da run `seed` com o baralho pedido (contagem por tipo). */
async function phase(seed, depth, deck) {
  await page.evaluate(([seed, depth, deck]) => {
    const t = window.__topple; t.newRun(seed);
    const g = t.game; g.run.seed = seed; g.run.depth = depth; g.run.cards = [];
    let uid = 9000;
    for (const [type, n] of Object.entries(deck)) for (let i = 0; i < n; i++) g.run.cards.push({ uid: uid++, type, seals: [] });
  }, [seed, depth, deck]);
  await wait(1600);
  await page.evaluate(() => window.__topple.game.startPhase());
  await wait(2200);
}

/** Desenha traços: cada um é [tipo, x, z] a partir da ponta atual (o 1º sai do gatilho). */
async function draw(strokes) {
  return page.evaluate((strokes) => {
    const g = window.__topple.game, L = g.layout;
    // a mão vira o baralho inteiro (sem limite de mão) para montar a cena de uma vez
    const pile = L.pile; while (pile && pile.size) L.newHand(99);
    let st = null;
    const log = [];
    for (const [kind, x, z] of strokes) {
      if (!st) { const t = L.spec.trigger; st = L.begin(t.x, t.z, kind).stroke; }
      const r = L.extend(st, x, z, kind);
      log.push(`${kind}→${r.placed.length}${r.fail ? ' ' + r.fail : ''}`);
    }
    g.board.clearPieces();
    for (const p of L.pieces) g.board.addPiece(p, false);
    g.refreshHud();
    return log.join(' | ');
  }, strokes);
}

async function fire(frames) {
  await page.keyboard.press('Space');
  let i = 0;
  for (const ms of frames) { await wait(ms); await shot(`sim-${frames.tag ?? ''}${i++}`); }
}

try {
  await page.goto(url);
  await page.waitForFunction(() => window.__topple, null, { timeout: 60000 });
  await wait(2500);

  // 1) fase gerada com porteira + arqueiro + patrulha
  await phase(1234, 6, { common: 36, fork: 3, heavy: 3, tower: 4, runner: 1, jumper: 1 });
  await shot('1-porteira-arqueiro');
  await wait(9500);
  const gp = await page.evaluate(() => { const g = window.__topple.game; const v = g.board.gateViews[0]; const p = v.grate.getWorldPosition(new v.grate.position.constructor()); p.y = 0.35; p.project(g.world.camera); return { x: (p.x + 1) / 2 * innerWidth, y: (1 - p.y) / 2 * innerHeight }; });
  console.log('grade na tela:', gp);
  await page.screenshot({ path: path.join(out, 'nov-1b-porteira-zoom.png'), clip: { x: Math.max(0, gp.x - 200), y: Math.max(0, gp.y - 130), width: 400, height: 260 } });
  console.log('fase 1:', await page.evaluate(() => { const s = window.__topple.game.spec; return { gates: s.gates?.length, kinds: s.enemies.map((e) => e.kind).join(','), hint: s.hint }; }));

  // 2) Saltadora + Foguete numa fase sem nada no caminho (primeira fase): trajeto e arco desenhados
  await phase(7, 0, { common: 30, tower: 3, runner: 2, jumper: 2 });
  const t = await page.evaluate(() => window.__topple.game.spec.trigger);
  const dir = Math.sign(Math.sin(t.yaw)) || 1;
  console.log('cena 2:', await draw([
    ['common', t.x + dir * 1.2, t.z],
    ['tower', t.x + dir * 1.6, t.z],
    ['common', t.x + dir * 3.0, t.z],
    ['jumper', t.x + dir * 3.4, t.z],
    ['common', t.x + dir * 6.0, t.z],
    ['runner', t.x + dir * 6.3, t.z + 0.4],
  ]));
  await wait(500);
  await shot('2-plano-saltadora-foguete');
  frames: {
    const f = [350, 350, 350, 450, 600, 900];
    f.tag = 'salto-';
    await page.evaluate(() => { window.__topple.game.speed = 0.6; });
    await fire(f);
  }
  await wait(2500);
  console.log('estado:', await page.evaluate(() => window.__topple.state()));
  console.log('peças:', await page.evaluate(() => { const s = window.__topple.game.sim; return s ? s.pieces.map((q) => q.p.type.slice(0, 3) + (q.fallen ? 'F' : '.') + (q.motion ? 'M' : '')).join(' ') : 'sem sim'; }));
} catch (e) {
  console.error('ERRO', e);
  await shot('99-erro');
} finally {
  if (errors.length) console.log('erros da página:', errors.slice(0, 8));
  await browser.close();
  await server.close();
}
