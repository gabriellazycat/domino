import { openGame, shot, closeAll } from './lib.mjs';
import { enterRun } from './scene.mjs';
const { browser, page } = await openGame({});
await shot(page, 'ui-menu');
await enterRun(page, 7);
await page.waitForTimeout(1500);
await shot(page, 'ui-planning');
for (const k of ['shop', 'press', 'mystic']) {
  await page.evaluate((k) => window.__topple.openEvent(k), k);
  await page.waitForTimeout(5000);
  await shot(page, 'ui-ev-' + k);
}
await page.evaluate(() => window.__topple.transition());
await page.waitForTimeout(1200);
await shot(page, 'ui-transition');
await page.waitForTimeout(5000);
await page.evaluate(() => window.__topple.autoPlan());
await page.waitForTimeout(800);
await shot(page, 'ui-planned');
await page.keyboard.press('Enter');
await page.waitForTimeout(12000);
await shot(page, 'ui-result');
await closeAll(browser);
