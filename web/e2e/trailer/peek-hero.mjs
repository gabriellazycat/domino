import { openGame, hideHud, shot, closeAll } from './lib.mjs';
import { enterRun, loadHero, placeNext, fire } from './scene.mjs';
const { browser, page } = await openGame({});
await enterRun(page);
console.log(await loadHero(page));
await hideHud(page, true);
await placeNext(page, 999);
await page.waitForTimeout(1500);
await shot(page, 'hero-plan');
await fire(page);
for (const s of [2, 4, 7, 11]) { await page.waitForTimeout(s === 2 ? 2000 : (s - [2, 4, 7, 11][[2, 4, 7, 11].indexOf(s) - 1]) * 1000); await shot(page, 'hero-t' + s); }
console.log(await page.evaluate(() => window.__dominotion.state()));
await closeAll(browser);
