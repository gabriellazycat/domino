// Listas de cortes (tempos de origem em segundos nas tomadas de raw/).
// Estrutura (pesquisa): GANCHO no 1º segundo → montar/disparar (o loop) → gênero → conteúdo → roguelike → clímax → chamada.

const S = (src, inn, dur, o = {}) => ({ src, in: inn, dur, ...o });

// ---------------- YouTube / Steam 16:9 (~46 s) ----------------
const ytSegs = [
  S('hero-cine', 10.15, 1.6, { speed: 0.5 }),               // 0.0  gancho: explosão no General (câmera lenta)
  S('hero-wide', 11.0, 0.9, { speed: 11.5, rev: true, gain: 0.35 }), // 1.6  rebobina até a mesa vazia
  S('hero-wide', 0.6, 2.4),                                  // 2.5  montagem relâmpago
  S('hero-wide', 3.0, 0.9),                                  // 4.9  pausa → DISPARA (3.53)
  S('hero-cine', 4.0, 5.0),                                  // 5.8  Torre, Trifurcação, ramos
  S('hero-cine', 9.0, 1.1),                                  // 10.8 Pesada no brutamontes
  S('hero-boss', 10.15, 1.8, { speed: 0.5 }),                // 11.9 Explosiva no chefe (outro ângulo)
  S('hero-wide', 11.3, 2.0),                                 // 13.7 todos no chão
  S('hero-wide', 13.3, 2.5, { blur: 7, dark: 0.7 }),         // 15.7 logo + gênero
  S('draw', 0.9, 3.0),                                       // 18.2 o jogador traça (trilha fantasma, mão)
  S('runner', 1.6, 1.8),                                     // 21.2 Foguete
  S('hero-boss', 6.0, 1.5),                                  // 23.0 trifurcação de perto
  S('enemies', 0.6, 3.0),                                    // 24.5 inimigos especiais
  S('hero-boss', 8.8, 1.5),                                  // 27.5
  S('sweep', 0.3, 2.6),                                      // 29.0 a mão do dono da mesa
  S('ev-mystic', 1.0, 2.0, { gain: 0.6 }),                   // 31.6 altar
  S('ev-shop', 1.0, 1.6, { gain: 0.6 }),                     // 33.6 loja
  S('draw', 2.2, 1.8),                                       // 35.2 cartas da mão voando
  S('hero-boss', 9.4, 1.2),                                  // 37.0 clímax
  S('hero-cine', 10.4, 2.4, { speed: 0.5 }),                 // 38.2
  S('hero-wide', 10.4, 1.4),                                 // 40.6
  S('hero-wide', 14.0, 4.5, { blur: 9, dark: 0.75, gain: 0.5 }), // 42.0 tela final
];
const ytCaps = [
  { png: 'cap-plan', at: 2.7, dur: 2.0 },
  { png: 'cap-push', at: 4.85, dur: 1.5 },
  { png: 't-tower', at: 6.8, dur: 1.1 },
  { png: 't-trifork', at: 8.0, dur: 1.1 },
  { png: 't-jumper', at: 9.2, dur: 1.2 },
  { png: 't-blast', at: 12.0, dur: 1.5 },
  { png: 'cap-topple', at: 13.8, dur: 1.85 },
  { png: 'logo', at: 15.75, dur: 2.4 },
  { png: 'cap-genre', at: 16.0, dur: 2.15 },
  { png: 'cap-trick', at: 21.25, dur: 3.1 },
  { png: 't-rocket', at: 21.5, dur: 1.4 },
  { png: 'cap-fight', at: 24.6, dur: 2.7 },
  { png: 'cap-survive', at: 29.2, dur: 2.3 },
  { png: 'cap-box', at: 31.7, dur: 3.3 },
  { png: 'endcard', at: 42.3, dur: 4.2 },
];

// ---------------- Instagram Reels 9:16 (~31 s) ----------------
const igSegs = [
  S('hero-vert-cine', 10.15, 1.5, { speed: 0.5 }),               // 0.0  gancho
  S('hero-vert', 11.0, 0.8, { speed: 13, rev: true, gain: 0.35 }), // 1.5  rebobina
  S('hero-vert', 0.6, 2.4),                                       // 2.3  montagem
  S('hero-vert', 3.0, 0.9),                                       // 4.7  dispara
  S('hero-vert', 4.0, 5.0),                                       // 5.6  a árvore cai
  S('hero-vert', 9.0, 2.5),                                       // 10.6 chefe
  S('hero-vert', 12.0, 1.5, { blur: 7, dark: 0.7 }),              // 13.1 logo
  S('runner', 1.6, 1.8, { vcrop: 0.88 }),                         // 14.6
  S('enemies', 0.6, 2.6, { vcrop: 0.42 }),                        // 16.4
  S('sweep', 0.3, 2.4, { vcrop: 0.4 }),                           // 19.0
  S('ev-mystic', 1.0, 1.6, { vcrop: 0.5, gain: 0.6 }),            // 21.4
  S('hero-vert-cine', 9.3, 2.0),                                  // 23.0 clímax
  S('hero-vert', 14.0, 5.5, { blur: 9, dark: 0.75, gain: 0.5 }),  // 25.0 tela final
];
const igCaps = [
  { png: 'cap-plan-v', at: 2.5, dur: 2.1 },
  { png: 'cap-push-v', at: 4.7, dur: 1.5 },
  { png: 't-trifork-v', at: 7.6, dur: 1.4 },
  { png: 't-blast-v', at: 10.55, dur: 0.85 },
  { png: 'cap-topple-v', at: 11.45, dur: 1.6 },
  { png: 'logo-v', at: 13.15, dur: 1.4 },
  { png: 'cap-genre-v', at: 13.3, dur: 1.25 },
  { png: 'cap-trick-v', at: 14.7, dur: 1.65 },
  { png: 't-rocket-v', at: 14.9, dur: 1.4 },
  { png: 'cap-fight-v', at: 16.5, dur: 2.4 },
  { png: 'cap-survive-v', at: 19.1, dur: 2.2 },
  { png: 'cap-box-v', at: 21.45, dur: 1.5 },
  { png: 'endcard-v', at: 25.3, dur: 5.2 },
];

// ---------------- GIFs (Steam "About this game", redes) ----------------
const gifOpts = (width, fps, extra = {}) => ({ w: 1920, h: 1080, fps: 30, fadeOut: 0, sfxGain: 1, gif: { width, fps, ...extra } });
export const GIFS = {
  // herói: mesa vazia → montagem → dispara → tudo cai → rebobina até a mesa vazia (loop sem emenda)
  'topple-loop': { ...gifOpts(600, 12), segs: [
    S('hero-wide', 0.55, 1.0, { speed: 2.4 }),
    S('hero-wide', 2.95, 0.3, { speed: 2.33 }),
    S('hero-wide', 3.65, 2.75, { speed: 3 }),
    S('hero-wide', 11.9, 0.6, { speed: 18.9, rev: true, gain: 0.3 }),
  ] },
  'gif-plan': { ...gifOpts(480, 12), segs: [S('draw', 0.7, 3.4, { speed: 1.5 }), S('draw', 5.8, 1.6)] },
  'gif-pieces': { ...gifOpts(480, 12), segs: [S('hero-cine', 5.0, 3.0, { speed: 1.5 }), S('hero-boss', 10.2, 1.2, { speed: 0.6 })] },
  'gif-enemies': { ...gifOpts(480, 12), segs: [S('enemies', 0.5, 3.2)] },
  'gif-owner': { ...gifOpts(480, 12), segs: [S('sweep', 0.2, 2.6), S('ev-mystic', 1.0, 1.4)] },
};

export const EDL = {
  ...GIFS,
  'topple-reels-instagram': { w: 1080, h: 1920, fps: 30, segs: igSegs, caps: igCaps, music: { src: 'music-ig' }, musicGain: 1.6, sfxGain: 1 },
  'topple-trailer-youtube': { w: 1920, h: 1080, fps: 60, segs: ytSegs, caps: ytCaps, music: { src: 'music-yt' }, musicGain: 1.6, sfxGain: 1 },
};
