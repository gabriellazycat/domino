// Gravação quadro a quadro do TOPPLE (Playwright + Chrome com GPU + relógio virtual de timeshim.js).
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const here = path.dirname(fileURLToPath(import.meta.url));
export const root = path.resolve(here, '..', '..');
export const RAW = path.join(here, process.env.RAW_DIR ?? 'raw');
mkdirSync(RAW, { recursive: true });
export const FFMPEG = process.env.FFMPEG ?? path.join(process.env.LOCALAPPDATA ?? '', 'ffmpeg', 'bin', 'ffmpeg.exe');

const chrome = [process.env.BROWSER, 'C:/Program Files/Google/Chrome/Application/chrome.exe'].filter(Boolean).find((p) => existsSync(p));

let server = null;
export async function startServer() {
  server = await createServer({ root, server: { port: 5190 }, logLevel: 'error' });
  await server.listen();
  return server.resolvedUrls.local[0];
}

/** Abre o jogo num Chrome headless com GPU, viewport w×h (pixels finais = w×h×scale). */
export async function openGame({ w = 1920, h = 1080, scale = 1, audioSeconds = 90, settings = {} } = {}) {
  const url = server ? server.resolvedUrls.local[0] : await startServer();
  const browser = await chromium.launch({
    executablePath: chrome, headless: true,
    args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11', '--enable-unsafe-webgpu', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: scale });
  page.on('pageerror', (e) => console.error('[pageerror]', String(e)));
  page.on('console', (m) => { if (m.type() === 'error') console.error('[console]', m.text()); });
  await page.addInitScript((s) => { window.__CAP_AUDIO_SECONDS = s; }, audioSeconds);
  await page.addInitScript({ path: path.join(here, 'timeshim.js') });
  await page.addInitScript((st) => { try { localStorage.clear(); if (st) localStorage.setItem('topple.cap', '1'); } catch {} }, settings);
  await page.goto(url);
  await page.waitForFunction(() => window.__topple, null, { timeout: 90000 });
  await page.waitForTimeout(1200);
  const gl = await page.evaluate(() => { const c = document.createElement('canvas').getContext('webgl2'); const e = c.getExtension('WEBGL_debug_renderer_info'); return c.getParameter(e ? e.UNMASKED_RENDERER_WEBGL : c.RENDERER); });
  console.log('GPU:', gl);
  // som liga (o navegador exigiria um gesto)
  await page.evaluate(async () => { const m = await import('/src/game/audio.ts'); m.audio.unlock(); window.__audio = m.audio; });
  return { browser, page };
}

/** Esconde a HUD/DOM (tomadas "limpas"); `keep` = seletores que continuam visíveis. */
export async function hideHud(page, on = true) {
  await page.evaluate((on) => {
    let s = document.getElementById('cap-hide');
    if (!s) { s = document.createElement('style'); s.id = 'cap-hide'; document.head.appendChild(s); }
    const HAND = '#ui .top-left, #ui .top-right, #ui .coach, #ui .speech, #ui .banner, #ui .simbar, #ui .skip-hint, #ui .newhand, #ui .pile-actions, #ui .hand-lbl, #ui .lbl, #ui .toast, #ui .tip, #ui .ev-bar, #ui .next-chip, #ui .hp-key, #boot { opacity: 0 !important; }';
    s.textContent = on === 'hand' ? HAND : on ? '#ui, #boot { opacity: 0 !important; }' : '';
    // botão em inglês
    const f = document.querySelector('#ui .fire'); if (f && on === 'hand') f.textContent = 'FIRE!';
  }, on);
}

/**
 * Grava `seconds` de jogo a `fps` (tempo virtual) num MP4 quase sem perda + WAV.
 * `onFrame(i, t)` roda antes de cada quadro (para mover o mouse, disparar etc.).
 * `timeScale` < 1 grava em câmera lenta de verdade (o jogo anda menos por quadro).
 */
export async function record(page, name, { seconds, fps = 60, timeScale = 1, onFrame, audio = true, jpeg = false } = {}) {
  const out = path.join(RAW, name + '.mp4');
  const vp = page.viewportSize();
  const ff = spawn(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-',
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '14', '-pix_fmt', 'yuv420p', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg ' + c)))));
  await page.evaluate(() => window.__cap.begin());
  const cdp = await page.context().newCDPSession(page);
  const n = Math.round(seconds * fps);
  const dtMs = (1000 / fps) * timeScale;
  const t0 = Date.now();
  for (let i = 0; i < n; i++) {
    if (onFrame && (await onFrame(i, i / fps)) === 'stop') { console.log(`  ${name}: parou em ${i}`); break; }
    await page.evaluate((ms) => window.__cap.step(ms), dtMs);
    const shot = await cdp.send('Page.captureScreenshot', { format: jpeg ? 'jpeg' : 'png', quality: jpeg ? 95 : undefined, optimizeForSpeed: true });
    const buf = Buffer.from(shot.data, 'base64');
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (i % 120 === 0) process.stdout.write(`  ${name}: ${i}/${n} (${((Date.now() - t0) / 1000).toFixed(0)}s)\r`);
  }
  ff.stdin.end();
  await done;
  console.log(`  ${name}: até ${n} quadros (${vp.width}x${vp.height}) em ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  if (audio) {
    const len = await page.evaluate(() => window.__cap.finishAudio());
    if (len) {
      let b64 = '';
      for (let o = 0; o < len; o += 4_000_000) b64 += await page.evaluate(([o]) => window.__capWav.slice(o, o + 4_000_000), [o]);
      writeFileSync(path.join(RAW, name + '.wav'), Buffer.from(b64, 'base64'));
    }
  }
  return out;
}

export async function shot(page, name) {
  const p = path.join(here, 'shots', name + '.png');
  mkdirSync(path.dirname(p), { recursive: true });
  await page.screenshot({ path: p });
  return p;
}

export async function closeAll(browser) {
  await browser?.close();
  await server?.close();
  server = null;
}
