// Variações da arte "A Queda" (src/queda.js): cada câmera em duas paletas, mais uma folha sobre o fundo da loja Steam.
// uso: node build-queda.mjs
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(path.resolve(import.meta.dirname, '../../web/package.json'));
const { chromium } = require('playwright');

const src = path.join(import.meta.dirname, 'src');
const out = path.join(import.meta.dirname, 'queda');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const CAMS = { a: '3-4 lateral', b: 'ponto de fuga', c: 'do alto', d: 'atrás da corrente', e: 'close de baixo', f: 'espiral' };
const JOBS = [['a', 'sol'], ['a', 'menta'], ['b', 'tomate'], ['b', 'lima'], ['c', 'menta'], ['c', 'chiclete'], ['d', 'chiclete'], ['d', 'sol'], ['e', 'lima'], ['e', 'tomate'], ['f', 'creme'], ['f', 'sol']];
const files = [];
for (const [v, p] of JOBS) {
  const f = `${v}-${p}.png`;
  execFileSync('node', [path.join(src, 'render.mjs'), 'queda', '1232', '706', path.join(out, f), `v=${v}&p=${p}`], { stdio: 'inherit' });
  files.push([f, `${v.toUpperCase()} · ${CAMS[v]} · ${p}`]);
}

// folha: fundo azul-marinho da loja da Steam, para conferir o contraste
const steamBg = '#1b2838';
const html = `<!doctype html><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Lilita+One&display=block" rel="stylesheet">
<style>html,body{margin:0;background:${steamBg};font-family:'Lilita One',sans-serif;color:#c7d5e0}
.g{display:grid;grid-template-columns:repeat(3,440px);gap:22px;padding:22px}img{width:440px;height:252px;display:block;border-radius:3px}
figure{margin:0}figcaption{font-size:20px;padding:6px 2px 0}</style>
<div class="g">${files.map(([f, t]) => `<figure><img src="/q/${f}"><figcaption>${t}</figcaption></figure>`).join('')}</div>
<script>Promise.all([...document.images].map((i) => i.decode())).then(() => document.fonts.ready).then(() => { window.__done = true; });</script>`;
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(html); return; }
  const f = path.join(out, p.replace(/^\/q\//, ''));
  if (!fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': 'image/png' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch({ executablePath: fs.existsSync(chrome) ? chrome : undefined });
const page = await browser.newPage({ viewport: { width: 1430, height: 1200 }, deviceScaleFactor: 1 });
await page.goto(`http://127.0.0.1:${server.address().port}/`);
await page.waitForFunction(() => window.__done === true, null, { timeout: 30000 });
await page.screenshot({ path: path.join(out, '_comparativo-steam.png'), fullPage: true });
await browser.close();
server.close();
console.log('ok', out);
