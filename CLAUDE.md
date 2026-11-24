# DOMINOTION — mapa do projeto

Onde fica cada informação. Leia o arquivo certo antes de explicar ou mudar algo:
- **Regras e design atual:** `docs/JOGO.md`.
- **Valores** (vida, preços, chances, deck inicial…): só no código, em `web/src/core/rules.ts`, `pieces.ts`, `cards.ts`, `buffs.ts`, `events.ts`, `mapgen.ts` e `motion.ts`. Não copie esses números para os docs.
- **Código, comandos, arquitetura e build:** `web/README.md`.
- **Vilão (modelo 3D e trajes):** `tools/vilao2/PROGRESSO.md`.
- **Trailer:** `web/e2e/trailer/README.md` (saída em `marketing 4/`).

Regras:
- Se um doc e o código discordarem, o código vence. Corrija o doc no mesmo trabalho.
- Ao mudar uma mecânica, atualize `docs/JOGO.md`. Ao criar ou apagar um arquivo em `web/src`, atualize a árvore do `web/README.md`.
- Não existe mais projeto Unity nem GDD antigo. O nome antigo TOPPLE só sobrevive em ids internos (saves em `topple.*` e a pasta `%APPDATA%\TOPPLE`).
- Branch de trabalho: `web-remake`. Um push que mexe em `web/**` republica o jogo no GitHub Pages.
