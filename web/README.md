# DOMINOTION — código

Jogo em **Three.js** (gráficos), **Rapier** (física), **TypeScript** e **Vite**.
- Quase todo o visual é gerado por código. A exceção é o boneco do vilão, `src/assets/vilao.glb`, que é gerado por `tools/vilao2/export_jogo.py`.
- Todo o som é sintetizado no WebAudio.

Como o jogo funciona: [docs/JOGO.md](../docs/JOGO.md).

## Rodar
Precisa do Node.js 18 ou mais novo. No Windows, dá para dar dois cliques em `Jogar.bat`.

```bash
npm install
npm run dev        # http://localhost:5173
```

| comando | o que faz |
| --- | --- |
| `npm run typecheck` | checa os tipos (tsc) |
| `npm test` | vitest: física, bot, mão/caixa, selos, peças malditas, inimigos, Foguete/Saltadora, draft |
| `npm run build` | typecheck + build de produção em `dist/` |
| `npm run preview` | serve o build em http://localhost:4173 |
| `npm run e2e` | teste de fumaça no Chrome (Playwright), com screenshots em `e2e/shots/` |
| `node e2e/human.mjs` | simula um jogador clicando: traçar, desfazer, vencer, draft |
| `node e2e/lab.mjs <modo>` | capturas de inspeção visual (eventos, trajes, mãos, câmera, menu…); os modos estão no topo do arquivo |
| `npm run desktop` | abre na janela do Electron |
| `npm run dist:win` | gera `release/DOMINOTION-win32-x64/` e o `.zip` |

Para desenvolver, `npm run dev` com `?evento=shop|press|mystic|curse` na URL abre direto num evento (só no servidor local).

## Publicação
- **Web:** `.github/workflows/pages.yml` publica no GitHub Pages a cada push na `web-remake` que mexa em `web/**`.
- **Desktop (Steam):**
  - `npm run dist:win` empacota com o Electron um `DOMINOTION.exe` que não precisa de nada instalado.
  - Abre em tela cheia; `F11` ou `Alt+Enter` alternam.
  - O menu ganha o botão **Sair do jogo**.
  - O save fica em `%APPDATA%\TOPPLE`, nome antigo mantido para não perder saves.
  - Na Steamworks: subir a pasta `release/DOMINOTION-win32-x64/` como depot de Windows, com launch `DOMINOTION.exe`.

## Arquitetura
```
src/
  main.ts        entrada: fontes, idioma, cria o Game
  i18n.ts        idiomas (texto-fonte em PT; t('…') traduz) · i18n.en.ts = inglês
  style.css      HUD e menus
  assets/vilao.glb   boneco do dono da mesa (T7B)
  core/          regras puras, sem gráficos (testáveis)
    rules.ts       constantes da run: vida, deck inicial, tentativas, mão, preços, ouro, chefe
    pieces.ts      catálogo de peças (jogáveis + malditas) e o deck
    cards.ts       peças únicas da caixa e os selos (kind = tipo + selos)
    buffs.ts       bênçãos do altar
    events.ts      sorteio dos eventos entre fases e as ofertas
    draw.ts        a caixa da fase: embaralhar, pegar, descartar
    rewards.ts     draft 1-de-3 por raridade
    run.ts         estado da run + auto-save (localStorage) e migração de saves
    mapgen.ts      gerador de fases por seed: inimigos, muros, fortificações, porteiras, par
    layout.ts      modelo do planejamento: trilhas, pontas, curvas, divisões
    motion.ts      movimentos roteirizados do Foguete e da Saltadora/Mola
    archer.ts      qual peça cada Arqueiro vai queimar
    bot.ts         planejador automático (A*) dos testes e da demo do menu
    rng.ts         RNG com seed (toda a aleatoriedade de gameplay passa aqui)
  game/          tudo que aparece na tela
    game.ts        controlador: entrada, planejamento, disparo, resultado, draft, eventos
    sim.ts         simulação física (Rapier): dano, patrulhas, tocha, flecha, porteira
    solver.ts      roda o bot + física sem tela para achar um plano que vence
    demoWorker.ts  demo do menu num Web Worker
    world.ts       renderer, mesa, luz, velas, pós-processamento
    board.ts       cenário da fase, peças e inimigos na tela, sincronizados com a física
    models.ts      dominós, soldadinhos, muros (procedurais)
    faces.ts       rostos dos dominós e reações · enemyFaces.ts = rostos dos inimigos
    toon.ts        materiais "brinquedo pintado" com contorno de luz
    textures.ts    texturas procedurais em canvas
    backdrop.ts    redemoinho de tinta no fundo + a cabeça do dono
    vilaoOficial.ts  carrega o vilao.glb e monta o dono, com marionete, olho, laca e trajes:
                     vilaoMarionete.ts, vilaoOlho2d.ts, vilaoLaca.ts, vilaoTrajes.ts
    hand.ts        a mão que varre a mesa entre as fases (com as luvas de cada traje)
    handrender.ts  as peças da mão em 3D
    events.ts      cenas 3D dos eventos (loja, prensa, altar, presente) · shopStyles.ts = cenário da loja
    props.ts       objetos 3D dos eventos · sigils.ts = desenhos de selos e bênçãos
    curseTalk.ts   falas das peças malditas
    fx.ts          partículas e textos · decals.ts = marcas na mesa
    audio.ts       som e música sintetizados
    camera.ts      câmera orbital, tremida e "olhar para o dono"
  ui/
    ui.ts          HUD, menus, pausa, opções
    handview.ts    caixa de peças, suporte da mão, descarte e animações
    icons.ts       ícones SVG da interface
tests/           vitest
e2e/             Playwright: smoke, human, lab e trailer/ (pipeline do trailer, ver trailer/README.md)
electron/        janela desktop · scripts/package-win.mjs = empacotador
```
