// Variações de estilo artístico da arte 4 (impacto). uso: node build-estilos.mjs [estilo ...]
// Renderiza a arte original e passa cada estilo de src/fx.js por cima; saída em estilos-impacto/.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(path.resolve(import.meta.dirname, '../../web/package.json'));
const { chromium } = require('playwright');

const src = path.join(import.meta.dirname, 'src');
const out = path.join(import.meta.dirname, 'estilos-impacto');
fs.mkdirSync(out, { recursive: true });
const base = path.join(out, '0-original.png');
execFileSync('node', [path.join(src, 'render.mjs'), 'impacto', '1232', '706', base], { stdio: 'inherit' });
execFileSync('node', [path.join(src, 'render.mjs'), 'impacto', '1232', '706', path.join(out, '_mask.png'), 'mask=ink'], { stdio: 'inherit' });

const ALL = ['aquarela', 'oleo', 'pixel', 'riso', 'xilo', 'neon', 'giz', 'papel'];
const styles = process.argv.slice(2).length ? process.argv.slice(2) : ALL;

const types = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const f = p.startsWith('/out/') ? path.join(out, p.slice(5)) : path.join(src, p);
  if (!fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch({ executablePath: fs.existsSync(chrome) ? chrome : undefined });
const page = await browser.newPage({ viewport: { width: 1232, height: 706 }, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.error('[page]', e.message));
for (const [i, s] of styles.entries()) {
  const n = ALL.indexOf(s) + 1;
  await page.goto(`http://127.0.0.1:${port}/fx.html?style=${s}&src=/out/0-original.png&mask=/out/_mask.png`);
  await page.waitForFunction(() => window.__done === true, null, { timeout: 120000 });
  const f = path.join(out, `${n}-${s}.png`);
  await page.screenshot({ path: f, clip: { x: 0, y: 0, width: 1232, height: 706 } });
  console.log('ok', f, `(${i + 1}/${styles.length})`);
}
// folha comparativa 3x3
await page.setViewportSize({ width: 1902, height: 1240 });
await page.goto(`http://127.0.0.1:${port}/sheet.html`);
await page.waitForFunction(() => window.__done === true, null, { timeout: 30000 });
await page.screenshot({ path: path.join(out, '_comparativo.png'), fullPage: true });
console.log('ok comparativo');
await browser.close();
server.close();
