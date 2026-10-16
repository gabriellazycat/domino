# TOPPLE — versão web

Remake do TOPPLE (ideia e GDD originais do Gamonga) rodando direto no navegador:
**Three.js** (gráficos) + **Rapier** (física) + **TypeScript** + **Vite**.
Todo o visual e todo o som são gerados por código — nenhum arquivo de arte ou áudio.

## Rodar

Precisa só do [Node.js](https://nodejs.org) 18 ou mais novo.

```bash
cd web
npm install
npm run dev        # abre em http://localhost:5173
```

No Windows dá pra dar dois cliques em `Jogar.bat` (instala na primeira vez e abre o jogo).

Outros comandos:

| comando | o que faz |
| --- | --- |
| `npm run build` | build de produção em `dist/` (dá pra hospedar em qualquer site estático, ex. GitHub Pages) |
| `npm run preview` | serve o build em http://localhost:4173 |
| `npm test` | testes de física + bot (o bot resolve os tutoriais e uma bateria de fases geradas) |
| `npm run e2e` | teste de fumaça no Chrome com screenshots em `e2e/shots/` |
| `node e2e/human.mjs` | simula um jogador de verdade com o mouse (arrastar, desfazer, vencer, draft) |

## Como jogar

1. **Clique** na bandeira verde e mova o mouse: uma trilha fantasma mostra onde as peças vão.
   **Clique no chão** para colocar a trilha de uma vez. Para continuar, clique numa ponta (anel brilhante) e repita. Curvas fechadas demais não valem.
2. **DISPARAR!** (ou `Enter`) — o primeiro dominó cai e a onda corre pela corrente.
3. Derrube todos os soldadinhos. Cada sobrevivente tira 1 de vida. Você tem 3 tentativas por fase,
   e planejar é de graça.
4. Ganhe ouro (estrelas = usar até o "par" de peças + acertar de primeira), escolha 1 de 3 peças novas
   depois de cada fase e gaste na **loja** a cada 3 fases. A cada 5 fases tem um **General** (chefe).

Peças: **Comum**, **Pesada** (derruba brutamontes), **Grande** (pula lava e vãos), **Torre**,
**Explosiva** (TNT, explode em área), **Corredora** (é lançada para frente) e **Bifurcação**
(divide a corrente em duas).

Controles: `1–7` troca a peça · botão direito remove a ponta · `Ctrl+Z` desfaz o traço · `R` limpa ·
câmera: botão direito/meio arrasta, roda = zoom, `WASD` move · `Esc` pausa.

## Por que web?

O projeto Unity original (que continua intacto na raiz do repositório) precisa do Unity 6 instalado
e logado para abrir. A versão web roda em qualquer computador com um navegador, carrega em segundos,
pode ser publicada como site e é fácil de mexer: é só editar um `.ts` e o jogo recarrega na hora.

## Arquitetura

```
src/
  core/      regras puras, sem gráficos (testáveis)
    rules.ts     constantes do jogo (vida, deck inicial, preços, loja, chefe…)
    pieces.ts    os 7 tipos de peça e o baralho
    mapgen.ts    gerador procedural de fases (mesma seed = mesmo mapa)
    layout.ts    desenho da corrente (curvas, bifurcação, lava)
    bot.ts       planejador automático (A*) usado pelos testes e pela demo do menu
    run.ts       estado da run + auto-save (localStorage)
    rewards.ts   draft 1-de-3
  game/      tudo que aparece na tela
    sim.ts       simulação física (Rapier)
    solver.ts    roda simulações sem tela para achar um plano que vence
    world.ts     renderer, lâmpada pendurada, velas, mesa, pós-processamento (bloom + CRT)
    backdrop.ts  redemoinho de tinta no fundo + o "dono da mesa" (olhos brilhando no escuro)
    models.ts    dominós, soldadinhos assombrados, muros, lava (tudo procedural)
    faces.ts     rostos 2D dos dominós e suas reações (medo, grito, tontura…)
    hand.ts      a mão que varre o tabuleiro entre as fases
    fx.ts        partículas, textos "POW!", brasas, explosões
    audio.ts     efeitos e música sintetizados (WebAudio)
    camera.ts    câmera orbital + tremida
    game.ts      controlador: planejamento, disparo, resultado, draft, loja
  ui/ui.ts   HUD e menus (HTML/CSS)
tests/     testes (vitest)
e2e/       testes no navegador (Chrome via Playwright)
```
