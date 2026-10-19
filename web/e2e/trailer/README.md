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

Brutos, revisões e saídas ficam fora do git.
