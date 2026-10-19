// Vídeo de revisão: fase herói com a câmera do próprio jogo (sem câmera de cinema), HUD visível.
import { openGame, record, closeAll, hideHud } from './lib.mjs';
import { enterRun, loadHero, placeNext, fire, installEnglish } from './scene.mjs';
const name = process.argv[2] ?? 'review-sim';
const hud = process.argv[3] !== 'clean';
const { browser, page } = await openGame({ w: 1280, h: 720, audioSeconds: 30 });
await enterRun(page, 11);
await loadHero(page);
await installEnglish(page);
if (!hud) await hideHud(page, true);
await placeNext(page, 999);
await page.waitForTimeout(1500);
const fps = 30;
let end = -1;
await record(page, name, { seconds: 22, fps, jpeg: true, onFrame: async (i) => {
  if (i === 15) await fire(page);
  if (i > 30 && end < 0 && i % 10 === 0 && (await page.evaluate(() => window.__topple.state().mode !== 'sim'))) end = i + 75;
  if (end > 0 && i >= end) return 'stop';
} });
await closeAll(browser);
