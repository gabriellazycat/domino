import '@fontsource/im-fell-english-sc/400.css';
import '@fontsource/silkscreen/400.css';
import '@fontsource/silkscreen/700.css';
import '@fontsource/nunito/600.css';
import '@fontsource/nunito/800.css';
import '@fontsource/nunito/900.css';
import './style.css';
import RAPIER from '@dimforge/rapier3d-compat';
import { Game } from './game/game';

async function boot() {
  await RAPIER.init();
  const canvas = document.getElementById('gl') as HTMLCanvasElement;
  const game = new Game(canvas);
  (window as any).__topple = game.debugApi();
  const bootEl = document.getElementById('boot')!;
  bootEl.classList.add('gone');
  setTimeout(() => bootEl.remove(), 600);
}

boot().catch((e) => {
  console.error(e);
  const sub = document.querySelector('.boot-sub');
  if (sub) sub.textContent = 'Erro ao iniciar: ' + (e?.message ?? e);
});
