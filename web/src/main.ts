import '@fontsource/im-fell-english-sc/400.css';
import '@fontsource/silkscreen/400.css';
import '@fontsource/silkscreen/700.css';
import '@fontsource/nunito/600.css';
import '@fontsource/nunito/800.css';
import '@fontsource/nunito/900.css';
import './style.css';
import RAPIER from '@dimforge/rapier3d-compat';
import { Game } from './game/game';
import { t, applyDocLang } from './i18n';

async function boot() {
  applyDocLang();
  await RAPIER.init();
  const canvas = document.getElementById('gl') as HTMLCanvasElement;
  const game = new Game(canvas);
  (window as any).__dominotion = game.debugApi();
  // só no servidor local: ?evento=shop|mystic|press|curse começa uma run e já entra no evento
  const ev = import.meta.env.DEV ? new URLSearchParams(location.search).get('evento') : null;
  if (ev) {
    const api = game.debugApi();
    api.newRun((Math.random() * 2 ** 32) >>> 0);
    setTimeout(() => api.openEvent(ev as Parameters<typeof api.openEvent>[0]), 3500);
  }
  const bootEl = document.getElementById('boot')!;
  bootEl.classList.add('gone');
  setTimeout(() => bootEl.remove(), 600);
}

boot().catch((e) => {
  console.error(e);
  const sub = document.querySelector('.boot-sub');
  if (sub) sub.textContent = t('Erro ao iniciar: ') + (e?.message ?? e);
});
