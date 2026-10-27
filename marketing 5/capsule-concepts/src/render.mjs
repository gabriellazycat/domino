// Renderiza as artes de capsule (SVG montado em art.html) para PNG com o Playwright do projeto web.
// uso: node render.mjs <cena> <largura> <altura> <saida.png> [querystring extra]
import { createRequire } from 'node:module';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(path.resolve(import.meta.dirname, '../../../web/package.json'));
const { chromium } = require('playwright');

const root = import.meta.dirname;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const f = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;

const [scene, w, h, out, extra = ''] = process.argv.slice(2);
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch({ executablePath: fs.existsSync(chrome) ? chrome : undefined });
const page = await browser.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: 1 });
page.on('console', (m) => { if (m.type() === 'error') console.error('[page]', m.text()); });
page.on('pageerror', (e) => console.error('[page]', e.message));
await page.goto(`http://127.0.0.1:${port}/art.html?scene=${scene}&w=${w}&h=${h}${extra ? '&' + extra : ''}`);
await page.waitForFunction(() => window.__done === true, null, { timeout: 30000 });
await page.screenshot({ path: out, clip: { x: 0, y: 0, width: +w, height: +h } });
await browser.close();
server.close();
console.log('ok', out);
