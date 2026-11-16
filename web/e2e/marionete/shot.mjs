// Captura a cabeça 1 (Cubo Entalhado) de frente, 1024x1024, fundo liso → arte_ia/cabeca_cubo/cubo_frente.png
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
const executablePath = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find((p) => existsSync(p));
const browser = await chromium.launch({ executablePath, headless: true, args: ['--headless=new', '--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 } });
page.on('pageerror', (e) => console.log('ERR', e));
await page.goto('http://localhost:5173/e2e/marionete/index.html?shot=1');
await page.waitForTimeout(1500);
await page.screenshot({ path: process.argv[2] ?? 'cubo_frente.png' });
await browser.close();
