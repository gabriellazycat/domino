// Listas de cortes da versão 2 (visual novo). Tomadas em raw2/; saída em "marketing 2".
// Estrutura (pesquisa): GANCHO no 1º segundo → montar/disparar (o loop) → gênero → conteúdo → roguelike → clímax → chamada.

const S = (src, inn, dur, o = {}) => ({ src, in: inn, dur, ...o });

// ---------------- YouTube / Steam 16:9 (~46 s) ----------------
const ytSegs = [
  S('hero-front', 9.55, 1.4, { speed: 0.5 }),                   // 0.0  gancho: os dominós em pânico chegando no General
  S('hero-front', 10.25, 1.2, { speed: 0.5 }),                  // 1.4  KABOOM (câmera lenta)
  S('hero-wide', 11.0, 0.8, { speed: 13, rev: true, gain: 0.35 }), // 2.6  rebobina até a mesa vazia
  S('hero-wide', 0.6, 2.4),                                     // 3.4  montagem relâmpago
  S('hero-wide', 3.0, 0.9),                                     // 5.8  dispara (3.53 → 6.33)
  S('hero-game', 4.0, 4.6),                                     // 6.7  câmera do jogo persegue a onda
  S('hero-cine', 8.6, 1.5),                                     // 11.3 ramos, Pesada no brutamontes
  S('hero-cine', 10.1, 1.8, { speed: 0.5 }),                    // 12.8 Explosiva no chefe
  S('hero-game', 12.3, 2.0),                                    // 14.6 a câmera abre: tudo no chão
  S('hero-wide', 13.3, 2.5, { blur: 7, dark: 0.7 }),            // 16.6 logo + gênero
  S('draw', 0.9, 3.0),                                          // 19.1 o jogador traça
  S('runner', 1.6, 1.8),                                        // 22.1 Foguete
  S('hero-front', 7.6, 1.6),                                    // 23.9 rostos esperando a onda
  S('enemies', 0.6, 3.0),                                       // 25.5 inimigos especiais
  S('sweep', 0.3, 2.2),                                         // 28.5 a mão do dono da mesa
  S('ev-mystic', 1.0, 2.4, { gain: 0.6 }),                      // 30.7 altar
  S('ev-shop', 1.0, 1.6, { gain: 0.6 }),                        // 33.1 loja
  S('draw', 2.2, 1.8),                                          // 34.7 cartas da mão voando
  S('hero-game', 10.4, 2.2),                                    // 36.5 clímax: câmera lenta do jogo no último inimigo
  S('hero-wide', 10.2, 1.6, { speed: 0.5 }),                    // 38.7 explosão vista de cima
  S('hero-wide', 11.0, 1.2),                                    // 40.3
  S('hero-wide', 14.0, 4.8, { blur: 9, dark: 0.75, gain: 0.5 }), // 41.5 tela final
];
const ytCaps = [
  { png: 'cap-plan', at: 3.55, dur: 2.1 },
  { png: 'cap-push', at: 5.85, dur: 1.5 },
  { png: 't-tower', at: 7.6, dur: 1.1 },
  { png: 't-trifork', at: 8.8, dur: 1.1 },
  { png: 't-jumper', at: 10.0, dur: 1.2 },
  { png: 't-blast', at: 12.9, dur: 1.5 },
  { png: 'cap-topple', at: 14.7, dur: 1.85 },
  { png: 'logo', at: 16.65, dur: 2.4 },
  { png: 'cap-genre', at: 16.9, dur: 2.15 },
  { png: 'cap-trick', at: 22.15, dur: 3.1 },
  { png: 't-rocket', at: 22.35, dur: 1.4 },
  { png: 'cap-fight', at: 25.6, dur: 2.8 },
  { png: 'cap-survive', at: 28.65, dur: 1.95 },
  { png: 'cap-box', at: 30.85, dur: 3.6 },
  { png: 'endcard', at: 41.8, dur: 4.5 },
];

// ---------------- Instagram Reels 9:16 (~31 s) ----------------
const igSegs = [
  S('hero-vert-cine', 10.15, 1.5, { speed: 0.5 }),                // 0.0  gancho
  S('hero-vert', 11.0, 0.8, { speed: 13, rev: true, gain: 0.35 }), // 1.5  rebobina
  S('hero-vert', 0.6, 2.4),                                       // 2.3  montagem
  S('hero-vert', 3.0, 0.9),                                       // 4.7  dispara
  S('hero-vert', 4.0, 5.0),                                       // 5.6  a árvore cai
  S('hero-vert', 9.0, 2.5),                                       // 10.6 chefe
  S('hero-vert', 12.0, 1.5, { blur: 7, dark: 0.7 }),              // 13.1 logo
  S('hero-front', 9.6, 1.6, { speed: 0.5, vcrop: 0.62 }),         // 14.6 rostos em pânico (close)
  S('runner', 1.6, 1.6, { vcrop: 0.88 }),                         // 16.2
  S('enemies', 0.6, 2.4, { vcrop: 0.42 }),                        // 17.8
  S('sweep', 0.3, 2.4, { vcrop: 0.4 }),                           // 20.2
  S('ev-mystic', 1.0, 1.6, { vcrop: 0.5, gain: 0.6 }),            // 22.6
  S('hero-vert-cine', 9.3, 2.0),                                  // 24.2 clímax
  S('hero-vert', 14.0, 5.0, { blur: 9, dark: 0.75, gain: 0.5 }),  // 26.2 tela final
];
const igCaps = [
  { png: 'cap-plan-v', at: 2.5, dur: 2.1 },
  { png: 'cap-push-v', at: 4.7, dur: 1.5 },
  { png: 't-trifork-v', at: 7.6, dur: 1.4 },
  { png: 't-blast-v', at: 10.55, dur: 0.85 },
  { png: 'cap-topple-v', at: 11.45, dur: 1.6 },
  { png: 'logo-v', at: 13.15, dur: 1.4 },
  { png: 'cap-genre-v', at: 13.3, dur: 1.25 },
  { png: 'cap-trick-v', at: 14.7, dur: 3.0 },
  { png: 't-rocket-v', at: 16.35, dur: 1.3 },
  { png: 'cap-fight-v', at: 17.9, dur: 2.2 },
  { png: 'cap-survive-v', at: 20.3, dur: 2.2 },
  { png: 'cap-box-v', at: 22.65, dur: 1.5 },
  { png: 'endcard-v', at: 26.5, dur: 4.7 },
];

// ---------------- GIFs (Steam "About this game", redes) ----------------
const gifOpts = (width, fps, extra = {}) => ({ w: 1920, h: 1080, fps: 30, fadeOut: 0, sfxGain: 1, gif: { width, fps, ...extra } });
const GIFS = {
  // herói: mesa vazia → montagem → dispara → tudo cai → rebobina até a mesa vazia (loop sem emenda)
  'topple-loop': { ...gifOpts(600, 12), segs: [
    S('hero-wide', 0.55, 1.0, { speed: 2.4 }),
    S('hero-wide', 2.95, 0.3, { speed: 2.33 }),
    S('hero-wide', 3.65, 2.75, { speed: 3 }),
    S('hero-wide', 11.9, 0.6, { speed: 18.9, rev: true, gain: 0.3 }),
  ] },
  // rostos em pânico + KABOOM (close de frente para o General)
  'gif-faces': { ...gifOpts(480, 12), segs: [S('hero-front', 9.55, 2.4, { speed: 0.55 })] },
  'gif-plan': { ...gifOpts(480, 12), segs: [S('draw', 0.7, 3.4, { speed: 1.5 }), S('draw', 5.8, 1.6)] },
  'gif-pieces': { ...gifOpts(480, 12), segs: [S('hero-game', 5.0, 3.0, { speed: 1.5 }), S('hero-cine', 10.2, 1.2, { speed: 0.6 })] },
  'gif-enemies': { ...gifOpts(480, 12), segs: [S('enemies', 0.5, 3.2)] },
  'gif-owner': { ...gifOpts(480, 12), segs: [S('sweep', 0.2, 2.6), S('ev-mystic', 1.0, 1.4)] },
};

export const EDL = {
  ...GIFS,
  'topple-trailer-youtube': { w: 1920, h: 1080, fps: 60, segs: ytSegs, caps: ytCaps, music: { src: 'music-yt2' }, musicGain: 1.6, sfxGain: 1 },
  'topple-reels-instagram': { w: 1080, h: 1920, fps: 30, segs: igSegs, caps: igCaps, music: { src: 'music-ig' }, musicGain: 1.6, sfxGain: 1 },
};
