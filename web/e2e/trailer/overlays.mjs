// Cartelas de texto e tela final (PNG transparente) com as fontes do jogo.
// node e2e/trailer/overlays.mjs
import { chromium } from 'playwright';
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { here, root } from './lib.mjs';

const OUT = path.join(here, 'overlays');
mkdirSync(OUT, { recursive: true });
const font = (pkg, file) => readFileSync(path.join(root, 'node_modules', '@fontsource', pkg, 'files', file)).toString('base64');
const FELL = font('im-fell-english-sc', 'im-fell-english-sc-latin-400-normal.woff2');
const PIX = font('silkscreen', 'silkscreen-latin-400-normal.woff2');

const CSS = `
@font-face { font-family: Fell; src: url(data:font/woff2;base64,${FELL}) format('woff2'); }
@font-face { font-family: Pix; src: url(data:font/woff2;base64,${PIX}) format('woff2'); }
html, body { margin: 0; background: transparent; overflow: hidden; }
.wrap { position: fixed; inset: 0; display: flex; flex-direction: column; align-items: center; }
.cap { font-family: Fell; color: #f3ead8; letter-spacing: .06em; text-align: center; line-height: 1;
  filter: drop-shadow(0 .06em 0 #3a0808) drop-shadow(0 0 .35em rgba(0,0,0,.85)) drop-shadow(0 .2em .4em rgba(0,0,0,.8)); }
.small { font-family: Pix; color: #ffd77a; letter-spacing: .12em; filter: drop-shadow(0 .1em 0 #3a0808) drop-shadow(0 0 .4em rgba(0,0,0,.9)); }
.logo { font-family: Fell; color: #e8dcc0; letter-spacing: .06em; line-height: .9;
  filter: drop-shadow(0 .045em 0 #3a0808) drop-shadow(0 0 .25em rgba(180,20,20,.5)) drop-shadow(0 .14em .2em rgba(0,0,0,.75)); }
.btn { font-family: Fell; color: #ffd77a; letter-spacing: .08em; padding: .45em 1.2em .38em; border: 3px solid #c9a24a; border-radius: .35em;
  background: linear-gradient(#3a1410, #1c0807); box-shadow: 0 0 0 4px rgba(0,0,0,.4), 0 .3em 1em rgba(0,0,0,.7), inset 0 0 .6em rgba(255,200,80,.15); }
`;

// legenda: [nome, texto, tamanho relativo, estilo]
const CAPS = [
  ['plan', 'Plan the chain.'],
  ['push', 'Push one piece.'],
  ['topple', 'Topple everything.'],
  ['genre', 'A domino roguelike'],
  ['trick', 'Every piece has a trick'],
  ['fight', 'They fight back.'],
  ['box', 'Build your box.'],
  ['survive', 'Survive the table.'],
  ['wishlist', 'Wishlist now on Steam'],
];
const TAGS = [['t-trifork', 'TRIFORK'], ['t-tower', 'TOWER'], ['t-jumper', 'JUMPER'], ['t-rocket', 'ROCKET'], ['t-blast', 'BLAST'], ['t-fork', 'FORK'], ['t-boss', 'THE GENERAL']];

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = await chromium.launch({ executablePath: existsSync(chrome) ? chrome : undefined });
for (const [w, h, sfx] of [[1920, 1080, ''], [1080, 1920, '-v']]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  const vert = h > w;
  const render = async (name, html) => {
    await page.setContent(`<style>${CSS}</style>${html}`);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(OUT, name + sfx + '.png'), omitBackground: true });
  };
  const capSize = vert ? 100 : 96;
  const capTop = vert ? '22vh' : '74vh';
  for (const [n, t] of CAPS) {
    await render('cap-' + n, `<div class="wrap" style="justify-content:flex-start;padding-top:${capTop}"><div class="cap" style="font-size:${capSize}px;max-width:90%">${t}</div></div>`);
  }
  for (const [n, t] of TAGS) {
    await render(n, `<div class="wrap" style="justify-content:flex-start;padding-top:${vert ? '36vh' : '84vh'}"><div class="small" style="font-size:${vert ? 72 : 64}px">${t}</div></div>`);
  }
  // tela final
  const L = vert ? 210 : 230;
  await render('endcard', `<div class="wrap" style="justify-content:center;gap:${vert ? 46 : 34}px">
    <div class="logo" style="font-size:${L}px">TOPPLE</div>
    <div class="cap" style="font-size:${vert ? 50 : 46}px;color:#e8dcc0">A domino roguelike</div>
    <div class="btn" style="font-size:${vert ? 58 : 54}px;margin-top:${vert ? 40 : 26}px">Wishlist now on Steam</div></div>`);
  await render('logo', `<div class="wrap" style="justify-content:center"><div class="logo" style="font-size:${vert ? 220 : 260}px">TOPPLE</div></div>`);
  await page.close();
}
await browser.close();
console.log('ok', OUT);
