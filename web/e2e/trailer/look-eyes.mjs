import { openGame, shot, closeAll } from './lib.mjs';
import { enterRun } from './scene.mjs';
const { browser, page } = await openGame({});
await page.waitForTimeout(9000);
await shot(page, 'eyes-menu');
await enterRun(page, 11);
await page.waitForTimeout(9000);
await shot(page, 'eyes-plan');
await closeAll(browser);
