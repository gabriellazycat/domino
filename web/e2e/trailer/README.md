# Trailer (v4, HyperFrames)

O trailer grava o próprio jogo quadro a quadro: Chrome headless com GPU, relógio virtual em `timeshim.js` e o áudio do jogo renderizado junto. A montagem é feita no [HyperFrames](https://hyperframes.heygen.com), vídeo em HTML + GSAP. Para rodar, precisa do ffmpeg em `%LOCALAPPDATA%\ffmpeg\bin` (ou na variável `FFMPEG`).

O resultado fica em `marketing 4/`: plano, brief, composição e o mp4, que não vai para o git.

```bash
node e2e/trailer/takes.mjs                                  # lista as tomadas
RAW_DIR=raw4 node e2e/trailer/takes.mjs press curse         # grava tomadas em raw4/
RAW_DIR=raw4 MNAME=music-yt4 MSECS=66 ARC="$(node e2e/trailer/trailer4.mjs arc)" node e2e/trailer/takes.mjs music
node e2e/trailer/trailer4.mjs                               # corta as cenas → marketing 4/composition/assets
node e2e/trailer/trailer4-html.mjs                          # gera marketing 4/composition/index.html
cd "../marketing 4/composition" && npx hyperframes check && npx hyperframes render --quality delivery
```

| arquivo | papel |
|---|---|
| `takes.mjs` | grava as tomadas, usando `lib.mjs` e `scene.mjs` |
| `director.ts` | fase da corrente herói e roteiro que a monta |
| `runner.ts` | mini fase do Foguete |
| `trailer4.mjs` | tabela de cenas (tomada, trecho, velocidade) e curva da trilha |
| `trailer4-html.mjs` | a composição; os textos são as falas reais do jogo (`src/i18n.en.ts`) |

**Atenção:** as tomadas brutas (`raw3/`, `raw4/`) não existem mais. Para fazer um corte novo, primeiro é preciso gravar as tomadas de novo. Os clipes já cortados do v4 estão em `marketing 4/composition/assets`.
