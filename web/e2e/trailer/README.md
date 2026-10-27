# Trailer, GIFs e prints

Gravação quadro a quadro do próprio jogo (Chrome headless com GPU + relógio virtual em `timeshim.js`,
áudio do jogo renderizado junto) e montagem com ffmpeg. Precisa do ffmpeg em
`%LOCALAPPDATA%\ffmpeg\bin` (ou na variável `FFMPEG`).

```bash
node e2e/trailer/overlays.mjs                       # cartelas de texto e tela final (PNG)
node e2e/trailer/takes.mjs                          # lista as tomadas
RAW_DIR=raw2 node e2e/trailer/takes.mjs hero-front hero-game hero-wide   # grava tomadas em raw2/
RAW_DIR=raw2 OUT_DIR="marketing 2" EDL=./edl2.mjs node e2e/trailer/build.mjs all
```

- `director.ts`: a fase da corrente herói e o roteiro que a monta com as regras do jogador; `try-hero.ts` confere na física.
- `runner.ts`: mini fase do Foguete com ricochete.
- `edl.mjs` / `edl2.mjs`: listas de cortes (versão 1 em `marketing/`, versão 2 em `marketing 2/`).
- `look*.mjs`, `review-sim.mjs`, `peek-*.mjs`: capturas de revisão.

## Trailer v4 (HyperFrames, pasta "marketing 4")

O v4 é montado com o [HyperFrames](https://hyperframes.heygen.com) (vídeo feito em HTML + GSAP) em vez de
cartelas PNG: legendas animadas, cartas das peças, balão do Dono da mesa e a tela final com os dominós.
Plano, brief e roteiro ficam em `marketing 4/`.

```bash
RAW_DIR=raw4 node e2e/trailer/takes.mjs press curse        # eventos novos (Prensa de Selos, Presente do Dono)
RAW_DIR=raw4 MNAME=music-yt4 MSECS=66 ARC="$(node e2e/trailer/trailer4.mjs arc)" node e2e/trailer/takes.mjs music
node e2e/trailer/trailer4.mjs                               # corta as cenas → marketing 4/composition/assets
node e2e/trailer/trailer4-html.mjs                          # gera marketing 4/composition/index.html
cd "../marketing 4/composition" && npx hyperframes check && npx hyperframes render --quality delivery
```

- `trailer4.mjs`: tabela de cenas (tomada, trecho, velocidade, congelamento) e a curva de intensidade da trilha.
- `trailer4-html.mjs`: a composição; textos são as falas reais do jogo (`src/i18n.en.ts`).

Brutos, revisões e saídas ficam fora do git.
